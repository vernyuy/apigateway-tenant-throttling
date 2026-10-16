import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { env } from './http';

export interface Employee {
  tenantId: string;
  employeeId: string;
  name: string;
  title: string;
  department: string;
  email: string;
  location: string;
}

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Fictional sample people, used to seed every new company's directory.
const SAMPLE: Omit<Employee, 'tenantId' | 'employeeId' | 'email'>[] = [
  { name: 'Amara Okafor', title: 'Head of People', department: 'People', location: 'Lagos' },
  { name: 'Liam Chen', title: 'Software Engineer', department: 'Engineering', location: 'Singapore' },
  { name: 'Sofia Martins', title: 'Finance Manager', department: 'Finance', location: 'Lisbon' },
  { name: 'Noah Dube', title: 'Sales Lead', department: 'Sales', location: 'Johannesburg' },
  { name: 'Priya Nair', title: 'Engineering Manager', department: 'Engineering', location: 'Bengaluru' },
  { name: 'Lucas Meyer', title: 'Operations Analyst', department: 'Operations', location: 'Berlin' },
  { name: 'Zanele Khumalo', title: 'Recruiter', department: 'People', location: 'Cape Town' },
  { name: 'Ethan Brooks', title: 'Account Executive', department: 'Sales', location: 'Toronto' },
];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'company';

export const seedEmployees = async (tenantId: string, companyName: string): Promise<void> => {
  const domain = `${slug(companyName)}.example`;
  const items: Employee[] = SAMPLE.map((person, i) => ({
    ...person,
    tenantId,
    employeeId: `emp_${String(i + 1).padStart(3, '0')}`,
    email: `${person.name.toLowerCase().replace(/\s+/g, '.')}@${domain}`,
  }));
  await db.send(
    new BatchWriteCommand({
      RequestItems: { [env('EMPLOYEES_TABLE')]: items.map((Item) => ({ PutRequest: { Item } })) },
    }),
  );
};

/**
 * Data isolation: every read is keyed on the caller's tenant ID, which comes from the validated
 * JWT, never from the request. There is no code path that can return another company's people.
 */
export const listEmployees = async (tenantId: string, department?: string): Promise<Employee[]> => {
  const result = await db.send(
    new QueryCommand({
      TableName: env('EMPLOYEES_TABLE'),
      KeyConditionExpression: 'tenantId = :tenantId',
      ExpressionAttributeValues: { ':tenantId': tenantId },
    }),
  );
  const employees = (result.Items ?? []) as Employee[];
  return department ? employees.filter((e) => e.department.toLowerCase() === department.toLowerCase()) : employees;
};

export const deleteEmployees = async (tenantId: string): Promise<void> => {
  const employees = await listEmployees(tenantId);
  for (let i = 0; i < employees.length; i += 25) {
    await db.send(
      new BatchWriteCommand({
        RequestItems: {
          [env('EMPLOYEES_TABLE')]: employees
            .slice(i, i + 25)
            .map(({ tenantId: t, employeeId }) => ({ DeleteRequest: { Key: { tenantId: t, employeeId } } })),
        },
      }),
    );
  }
};
