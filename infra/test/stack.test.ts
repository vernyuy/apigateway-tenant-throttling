import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { TenantApiStack } from '../lib/tenant-api-stack';
import { STAGE_THROTTLE, TIERS, usagePlanName } from '../lib/tiers';

const template = Template.fromStack(new TenantApiStack(new cdk.App(), 'Test'));

describe('TenantApiStack', () => {
  it.each(Object.entries(TIERS))('has a usage plan for the %s tier with per-key limits and a daily quota', (tier, t) => {
    template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
      UsagePlanName: usagePlanName('Test', tier),
      Throttle: { RateLimit: t.throttle.rateLimit, BurstLimit: t.throttle.burstLimit },
      Quota: { Limit: t.quota.limit, Period: t.quota.period },
    });
  });

  it('caps the whole stage above the per-tenant limits', () => {
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      MethodSettings: Match.arrayWith([
        Match.objectLike({
          ThrottlingRateLimit: STAGE_THROTTLE.rateLimit,
          ThrottlingBurstLimit: STAGE_THROTTLE.burstLimit,
        }),
      ]),
    });
  });

  it('requires both a Cognito JWT and an API key on tenant routes only', () => {
    const keyed = Object.values(
      template.findResources('AWS::ApiGateway::Method', { Properties: { ApiKeyRequired: true } }),
    );
    expect(keyed).toHaveLength(1);
    expect(keyed[0].Properties).toMatchObject({ HttpMethod: 'GET', AuthorizationType: 'COGNITO_USER_POOLS' });
  });

  it('gives every tenant user an immutable tenant_id claim', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      Schema: Match.arrayWith([Match.objectLike({ Name: 'tenant_id', Mutable: false, AttributeDataType: 'String' })]),
    });
  });

  it('has no Lambda authorizer in the tenant request path', () => {
    template.resourcePropertiesCountIs('AWS::ApiGateway::Authorizer', { Type: 'REQUEST' }, 0);
  });

  it('partitions the employee directory by company', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      KeySchema: [
        { AttributeName: 'tenantId', KeyType: 'HASH' },
        { AttributeName: 'employeeId', KeyType: 'RANGE' },
      ],
    });
  });

  it('reads API keys from the x-api-key header', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', { ApiKeySourceType: 'HEADER' });
  });

  it('logs the API key and user of every request', () => {
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      AccessLogSetting: { Format: Match.stringLikeRegexp('identity.apiKeyId.*authorizer.claims.sub') },
    });
  });
});
