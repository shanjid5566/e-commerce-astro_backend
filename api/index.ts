import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { Express } from "express";
import { AppModule } from "../src/app.module";
import { setupApp } from "../src/app.setup";

let cachedServer: Express;

async function bootstrapServer(): Promise<Express> {
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));

  setupApp(app);

  await app.init();
  return server;
}

export default async function handler(req: any, res: any) {
  try {
    if (!cachedServer) {
      cachedServer = await bootstrapServer();
    }
    return cachedServer(req, res);
  } catch (error: any) {
    console.error("Vercel Serverless Invocation Error:", error);
    return res.status(500).json({
      statusCode: 500,
      error: "Server Initialization Failed",
      message: error?.message || String(error),
      details: "Check Vercel Project Settings > Environment Variables (e.g. DATABASE_URL, JWT_SECRET).",
    });
  }
}
