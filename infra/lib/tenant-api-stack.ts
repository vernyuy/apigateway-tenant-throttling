import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { STAGE_THROTTLE, TIERS, usagePlanName } from './tiers';

export class TenantApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------- data
    // One record per company (tenant): tier, API key ID, ...
    const table = new dynamodb.TableV2(this, 'Tenants', {
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // The directory itself. Partitioned by company, so every read is naturally scoped to one tenant.
    const employeesTable = new dynamodb.TableV2(this, 'Employees', {
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'employeeId', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ---------------------------------------------------------------- identity
    // Tenant users sign in here. The immutable custom:tenant_id attribute ends up as a claim in
    // their ID token, which is how the API knows which tenant is calling.
    const userPool = new cognito.UserPool(this, 'TenantUsers', {
      featurePlan: cognito.FeaturePlan.LITE,
      selfSignUpEnabled: false,
      signInAliases: { username: true },
      customAttributes: { tenant_id: new cognito.StringAttribute({ mutable: false }) },
      passwordPolicy: { minLength: 12, requireSymbols: false },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const userPoolClient = userPool.addClient('WebClient', {
      // USER_PASSWORD_AUTH keeps the browser demo simple. Prefer SRP (or the hosted UI) in production.
      authFlows: { userPassword: true },
      generateSecret: false,
      idTokenValidity: cdk.Duration.hours(1),
    });

    const adminToken = new secretsmanager.Secret(this, 'AdminToken', {
      description: 'Bearer token for the demo admin API',
      generateSecretString: { passwordLength: 40, excludePunctuation: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ---------------------------------------------------------------- API
    const accessLogs = new logs.LogGroup(this, 'AccessLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const api = new apigw.RestApi(this, 'Api', {
      restApiName: 'company-directory-api',
      // Clients send the key in x-api-key. (The alternative, AUTHORIZER, has a Lambda authorizer return it.)
      apiKeySourceType: apigw.ApiKeySourceType.HEADER,
      // Needed for access logs. Note: this sets the account-wide API Gateway CloudWatch role for the Region.
      cloudWatchRole: true,
      deployOptions: {
        stageName: 'demo',
        // The ceiling for ALL tenants combined.
        throttlingRateLimit: STAGE_THROTTLE.rateLimit,
        throttlingBurstLimit: STAGE_THROTTLE.burstLimit,
        accessLogDestination: new apigw.LogGroupLogDestination(accessLogs),
        // Log which key and tenant made each call, so throttling can be traced per tenant.
        accessLogFormat: apigw.AccessLogFormat.custom(
          JSON.stringify({
            requestId: '$context.requestId',
            time: '$context.requestTime',
            method: '$context.httpMethod',
            path: '$context.resourcePath',
            status: '$context.status',
            // The API key identifies the tenant; sub identifies the signed-in user.
            apiKeyId: '$context.identity.apiKeyId',
            userSub: '$context.authorizer.claims.sub',
            errorType: '$context.error.responseType',
          }),
        ),
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS, // demo only
        allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
      },
    });

    // Without CORS headers on gateway errors, a browser can't even see that it got a 429 or 403.
    for (const [id, type] of [
      ['Default4xx', apigw.ResponseType.DEFAULT_4XX],
      ['Default5xx', apigw.ResponseType.DEFAULT_5XX],
    ] as const) {
      api.addGatewayResponse(id, { type, responseHeaders: { 'Access-Control-Allow-Origin': "'*'" } });
    }

    // ---------------------------------------------------------------- usage plans, one per tier
    const usagePlanNames: Record<string, string> = {};
    for (const [tier, { throttle, quota }] of Object.entries(TIERS)) {
      usagePlanNames[tier] = usagePlanName(this.stackName, tier);
      api.addUsagePlan(`${tier}UsagePlan`, {
        name: usagePlanNames[tier],
        description: `Per-tenant limits for the ${tier} tier`,
        throttle,
        quota: { limit: quota.limit, period: apigw.Period[quota.period] },
        apiStages: [{ api, stage: api.deploymentStage }],
      });
    }

    // ---------------------------------------------------------------- functions
    const fn = (name: string, extra: Record<string, string> = {}) =>
      new NodejsFunction(this, name, {
        entry: path.join(__dirname, '..', 'lambda', `${name}.ts`),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        // GET /employees takes every tenant request. Lambda gives more CPU with more memory, so cold
        // starts are shorter and each call holds one of the account's concurrent executions for less time.
        memorySize: name === 'employees' ? 1024 : 256,
        timeout: cdk.Duration.seconds(10),
        logGroup: new logs.LogGroup(this, `${name}Logs`, {
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        bundling: { minify: true, sourceMap: true },
        environment: {
          NODE_OPTIONS: '--enable-source-maps',
          TABLE_NAME: table.tableName,
          EMPLOYEES_TABLE: employeesTable.tableName,
          USER_POOL_ID: userPool.userPoolId,
          // Names, not IDs: passing the plan IDs here would create a dependency cycle.
          USAGE_PLAN_NAMES: JSON.stringify(usagePlanNames),
          // Static copy of the limits, so the console can show them. The plans themselves enforce them.
          TIER_LIMITS: JSON.stringify(TIERS),
          STAGE_LIMIT: JSON.stringify(STAGE_THROTTLE),
          ...extra,
        },
      });

    const apigwArn = (resourcePath: string) => `arn:${this.partition}:apigateway:${this.region}::${resourcePath}`;

    const adminAuthorizerFn = fn('admin-authorizer', { ADMIN_TOKEN_SECRET_ARN: adminToken.secretArn });
    adminToken.grantRead(adminAuthorizerFn);

    const employeesFn = fn('employees');
    table.grantReadData(employeesFn);
    employeesTable.grantReadData(employeesFn);

    const adminFn = fn('admin');
    table.grantReadWriteData(adminFn);
    employeesTable.grantReadWriteData(adminFn);
    adminFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminSetUserPassword', 'cognito-idp:AdminDeleteUser'],
        resources: [userPool.userPoolArn],
      }),
    );
    // Least privilege for managing keys and plan membership.
    adminFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['apigateway:POST'],
        resources: [apigwArn('/apikeys'), apigwArn('/usageplans/*/keys')],
      }),
    );
    adminFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['apigateway:GET'],
        resources: [apigwArn('/usageplans'), apigwArn('/usageplans/*/usage')],
      }),
    );
    adminFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['apigateway:PATCH', 'apigateway:DELETE'],
        resources: [apigwArn('/apikeys/*'), apigwArn('/usageplans/*/keys/*')],
      }),
    );
    // Lets the console size the traffic lab to the account's Lambda concurrency limit.
    // GetAccountSettings has no resource-level permissions, so the resource must be '*'.
    adminFn.addToRolePolicy(new iam.PolicyStatement({ actions: ['lambda:GetAccountSettings'], resources: ['*'] }));

    // ---------------------------------------------------------------- authorizers
    const adminAuth: apigw.MethodOptions = {
      authorizationType: apigw.AuthorizationType.CUSTOM,
      authorizer: new apigw.TokenAuthorizer(this, 'AdminAuthorizer', {
        handler: adminAuthorizerFn,
        resultsCacheTtl: cdk.Duration.minutes(5),
      }),
    };

    // Two independent checks on every tenant call, both done by API Gateway itself (no Lambda):
    //  1. the Cognito authorizer validates the JWT (who is calling, and for which tenant), and
    //  2. x-api-key is validated and its usage plan applied (which plan, how fast).
    const tenantAuth: apigw.MethodOptions = {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer: new apigw.CognitoUserPoolsAuthorizer(this, 'TenantAuthorizer', {
        cognitoUserPools: [userPool],
        resultsCacheTtl: cdk.Duration.minutes(5),
      }),
      apiKeyRequired: true,
    };

    // ---------------------------------------------------------------- routes
    const admin = new apigw.LambdaIntegration(adminFn);
    const tenantsResource = api.root.addResource('admin').addResource('tenants');
    tenantsResource.addMethod('GET', admin, adminAuth);
    tenantsResource.addMethod('POST', admin, adminAuth);
    const tenant = tenantsResource.addResource('{tenantId}');
    tenant.addMethod('DELETE', admin, adminAuth);
    tenant.addResource('tier').addMethod('POST', admin, adminAuth);
    tenant.addResource('usage').addMethod('GET', admin, adminAuth);
    const apiKey = tenant.addResource('api-key');
    apiKey.addResource('rotate').addMethod('POST', admin, adminAuth);
    apiKey.addResource('enabled').addMethod('POST', admin, adminAuth);

    api.root.addResource('employees').addMethod('GET', new apigw.LambdaIntegration(employeesFn), tenantAuth);

    // ---------------------------------------------------------------- outputs
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'Region', { value: this.region });
    new cdk.CfnOutput(this, 'AdminTokenCommand', {
      value: `aws secretsmanager get-secret-value --secret-id ${adminToken.secretArn} --query SecretString --output text`,
    });
  }
}
