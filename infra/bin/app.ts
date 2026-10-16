#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TenantApiStack } from '../lib/tenant-api-stack';

const app = new cdk.App();

new TenantApiStack(app, 'CompanyDirectoryApi', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
