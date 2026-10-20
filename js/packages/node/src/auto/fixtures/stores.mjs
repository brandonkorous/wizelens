// An Express app on real Redis, MongoDB, Elasticsearch, BullMQ, and SQS clients, with no WizeLens code (WIZELENS_TEST_REAL servers).
import { CreateQueueCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Client as Elastic } from "@elastic/elasticsearch";
import { Queue } from "bullmq";
import express from "express";
import IoRedis from "ioredis";
import { MongoClient } from "mongodb";
import { createClient } from "redis";

const env = process.env;
const ioredis = new IoRedis(env.WIZELENS_TEST_REDIS);
const redis = await createClient({ url: env.WIZELENS_TEST_REDIS }).connect();
const mongo = await new MongoClient(env.WIZELENS_TEST_MONGO).connect();
const es = new Elastic({ node: env.WIZELENS_TEST_ELASTIC });
const url = new URL(env.WIZELENS_TEST_REDIS);
const queue = new Queue(`auto-${Date.now()}`, { connection: { host: url.hostname, port: Number(url.port), maxRetriesPerRequest: null } });
const sqs = new SQSClient({ endpoint: env.WIZELENS_TEST_SQS, region: "us-east-1", credentials: { accessKeyId: "x", secretAccessKey: "x" } });
const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: `auto-${Date.now()}` }));

const app = express();
app.get("/stores", async (_req, res) => {
  await ioredis.get("auto:user:1");
  await redis.get("auto:cart:2");
  await mongo.db("auto").collection("orders").findOne({ id: 3 });
  await es.search({ index: "auto-*", allow_no_indices: true });
  await queue.add("welcome", {});
  await sqs.send(new SendMessageCommand({ QueueUrl, MessageBody: "{}" }));
  res.send("ok");
});
const server = app.listen(0, () => console.log(`ready ${server.address().port}`));
