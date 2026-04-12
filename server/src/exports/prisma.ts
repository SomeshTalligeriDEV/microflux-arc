import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL as string;

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString });
const adapter = new PrismaNeon(pool as any);

export const prisma = new PrismaClient({ adapter });