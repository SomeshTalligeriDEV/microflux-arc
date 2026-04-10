import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL as string;

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString });

export const prisma = new PrismaClient({ adapter });