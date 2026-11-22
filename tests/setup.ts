import { TEST_DATABASE_URL } from "./test-db-url";

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DATABASE_DRIVER = "pg";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.PUBLIC_URL = "https://bills.test";
process.env.GST_GSTIN = "32ABCDE1234F1Z5";
process.env.GST_ADDRESS = "Kozhikode, Kerala";
process.env.BILLING_APPS = "QK:QuizKerala:qk-key-qk-key-qk-key-qk-key;RC:Recallio:rc-key-rc-key-rc-key-rc-key";
