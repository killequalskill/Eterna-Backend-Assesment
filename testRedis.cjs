const Redis = require("ioredis");

const url = "rediss://default:AVibAAIncDJlMmMwNjU3OTQ1N2Q0NGM2YjUwODA4MWEwZDU5OGI5NnAyMjI2ODM@stable-midge-22683.upstash.io:6379";

const redis = new Redis(url, { tls: {} });

redis.ping()
  .then((res) => {
    console.log("PING Response:", res);
    process.exit(0);
  })
  .catch((err) => {
    console.error("PING Error:", err);
    process.exit(1);
  });
