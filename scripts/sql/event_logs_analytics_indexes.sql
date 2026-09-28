-- event_logs / api_tokens 分析热点索引 —— 生产预建脚本（CONCURRENTLY，不锁写）
--
-- 用途：在升级到含迁移 202609281000_event_log_analytics_indexes /
--       202609281000_api_token_sort_indexes 的版本之前，先在生产库用
--       CREATE INDEX CONCURRENTLY 建好同名索引。之后应用启动时的迁移因
--       IF NOT EXISTS 会直接空跑，不会持写锁阻塞 event_logs 写入。
--
-- 重要：
--   1. CREATE INDEX CONCURRENTLY 不能放在事务里。用 psql 逐条执行，
--      不要包在 BEGIN/COMMIT 中，也不要用 -1/--single-transaction。
--   2. 若某条 CONCURRENTLY 中途失败，会残留一个 INVALID 索引；此时
--      IF NOT EXISTS 会跳过它但它仍无效。先用文末查询排查并 DROP 重建。
--   3. event_logs 在“日志库”(log_sql_dsn 指向的库)。api_tokens 在主库。
--      - 若未拆库(log_sql_dsn 为空)：整份脚本对同一个库执行即可。
--      - 若已拆库：前半段(event_logs)对日志库执行，后半段(api_tokens)对主库执行。

-- ============ event_logs（日志库） ============
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_logs_channel_created_at
  ON event_logs (channel_id, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_logs_type_created_at
  ON event_logs (type, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_logs_user_created_at
  ON event_logs (user_id, created_at);

-- 表达式索引，匹配 adminVisibleModelNameExpr（日志/账务按模型名过滤与分组）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_logs_model_created_at
  ON event_logs ((COALESCE(NULLIF(TRIM(request_model_name), ''), NULLIF(TRIM(model_name), ''))), created_at);

-- ============ api_tokens（主库） ============
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_tokens_created_time
  ON api_tokens (created_time);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_tokens_updated_time
  ON api_tokens (updated_time);

-- ============ 校验：确认索引都已 valid ============
-- 期望这 6 个索引都出现且 indisvalid = t：
--   SELECT c.relname AS index_name, i.indisvalid
--   FROM pg_class c
--   JOIN pg_index i ON i.indexrelid = c.oid
--   WHERE c.relname IN (
--     'idx_event_logs_channel_created_at',
--     'idx_event_logs_type_created_at',
--     'idx_event_logs_user_created_at',
--     'idx_event_logs_model_created_at',
--     'idx_api_tokens_created_time',
--     'idx_api_tokens_updated_time'
--   );
-- 如某行 indisvalid = f，说明该 CONCURRENTLY 曾失败，需：
--   DROP INDEX CONCURRENTLY <index_name>;  再重跑对应 CREATE 语句。
