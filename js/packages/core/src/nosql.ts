import type { Span } from "./types.js";

/** `db.system.name` values whose calls are commands or shapes, not SQL. Their text is never a session statement. */
export const NOSQL_SYSTEMS: ReadonlySet<string> = new Set(["redis", "valkey", "mongodb", "elasticsearch", "opensearch", "memcached", "dynamodb"]);

/** True when the span is a call to a NoSQL store (Redis, MongoDB, Elasticsearch...). */
export const isNoSqlSpan = (s: Span): boolean => NOSQL_SYSTEMS.has(String(s.attributes["db.system.name"] ?? "").toLowerCase());

const words = (list: string): Set<string> => new Set(list.split(/\s+/).filter(Boolean));

// Connection, transaction, and cursor commands: their repeats are by design, not N+1 (the same lists as the .NET add-on).
const SESSION_COMMANDS: Record<string, Set<string>> = {
  redis: words("multi exec discard watch unwatch select auth ping echo hello client quit reset readonly readwrite asking"),
  valkey: words("multi exec discard watch unwatch select auth ping echo hello client quit reset readonly readwrite asking"),
  mongodb: words("getmore killcursors endsessions committransaction aborttransaction"),
};

/** True for a NoSQL call that only manages the connection, a transaction, or a cursor. */
export function isNoSqlSession(s: Span): boolean {
  const set = SESSION_COMMANDS[String(s.attributes["db.system.name"] ?? "").toLowerCase()];
  return !!set && set.has(String(s.attributes["db.operation.name"] ?? "").toLowerCase());
}

// Redis commands, MongoDB methods, and Elasticsearch APIs, lower case, by the SQL operation they are closest to.
const READS = words(`find findone aggregate count countdocuments estimateddocumentcount distinct getmore search msearch get mget exists explain scroll
  search_template field_caps hget hmget hgetall hkeys hvals hlen hexists hstrlen smembers sismember smismember scard srandmember sinter sunion sdiff
  lrange llen lindex lpos zrange zrangebyscore zrevrange zrevrangebyscore zrangebylex zscore zmscore zcard zcount zrank zrevrank strlen ttl pttl type
  scan sscan hscan zscan keys getrange getbit bitcount pfcount xrange xrevrange xread xlen geopos geodist geosearch georadius randomkey dbsize`);
const INSERTS = words(`insert insertone insertmany index create set setex psetex setnx mset msetnx hset hsetnx hmset lpush rpush lpushx rpushx sadd
  zadd xadd pfadd geoadd linsert`);
const UPDATES = words(`update updateone updatemany replaceone findoneandupdate findoneandreplace update_by_query updatebyquery incr incrby incrbyfloat
  decr decrby hincrby hincrbyfloat zincrby append setrange getset setbit expire pexpire expireat pexpireat persist rename renamenx lset ltrim getex`);
const DELETES = words(`delete deleteone deletemany findoneanddelete delete_by_query deletebyquery del unlink hdel srem zrem zremrangebyscore
  zremrangebyrank zremrangebylex lrem xdel xtrim getdel drop flushdb flushall`);

/** SELECT, INSERT, UPDATE, DELETE, or OTHER for a NoSQL operation such as "GET", "findOne", or "search". */
export function noSqlOperation(name: string): "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "OTHER" {
  const op = name.toLowerCase();
  if (READS.has(op)) return "SELECT";
  if (INSERTS.has(op)) return "INSERT";
  if (UPDATES.has(op)) return "UPDATE";
  return DELETES.has(op) ? "DELETE" : "OTHER";
}
