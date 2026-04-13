import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

let _client: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (!_client) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Make sure it exists in server/.env",
      );
    }
    const adapter = new PrismaNeon({ connectionString });
    _client = new PrismaClient({ adapter });
  }
  return _client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, prop) {
    return (getClient() as any)[prop];
  },
});