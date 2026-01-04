-- ========================================
-- 訂單表 (orders)
-- 用於記錄所有付款訂單
-- ========================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'TWD',
  
  -- LINE Pay 相關
  transaction_id TEXT,
  line_pay_order_id TEXT UNIQUE NOT NULL,
  
  -- 訂單狀態
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
  
  -- 方案資訊
  plan_name TEXT,
  plan_duration INTEGER, -- 天數
  analyses_count INTEGER, -- 檢測次數 (-1 表示無限)
  
  -- 時間記錄
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  
  -- 額外資訊
  payment_info JSONB, -- 儲存完整的 LINE Pay 回應
  notes TEXT
);

-- 建立索引以提升查詢效能
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_transaction_id ON orders(transaction_id);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at_trigger
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_orders_updated_at();

-- ========================================
-- 更新 members 表 (如果欄位不存在)
-- ========================================

-- 檢查並添加 level 欄位
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'level'
  ) THEN
    ALTER TABLE members ADD COLUMN level VARCHAR(20) DEFAULT 'free' CHECK (level IN ('free', 'intermediate', 'expert', 'enterprise'));
  END IF;
END $$;

-- 檢查並添加 expires_at 欄位
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE members ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- 檢查並添加 total_analyses 欄位
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'total_analyses'
  ) THEN
    ALTER TABLE members ADD COLUMN total_analyses INTEGER DEFAULT 10; -- 免費會員預設 10 次
  END IF;
END $$;

-- 檢查並添加 remaining_analyses 欄位
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'remaining_analyses'
  ) THEN
    ALTER TABLE members ADD COLUMN remaining_analyses INTEGER DEFAULT 10;
  END IF;
END $$;

-- ========================================
-- 建立權限 (Nhost/Hasura)
-- ========================================

-- 用戶可以查看自己的訂單
COMMENT ON TABLE orders IS '@graphql({"table": {"select_permissions": ["user"]}, "name": "orders"})';

-- ========================================
-- 測試數據 (可選)
-- ========================================

-- 插入測試訂單（僅用於開發環境）
-- INSERT INTO orders (user_id, plan_id, amount, line_pay_order_id, status, plan_name, plan_duration, analyses_count)
-- VALUES (
--   'your-test-user-id',
--   'intermediate',
--   299.00,
--   'TEST-ORDER-001',
--   'completed',
--   '專業會員方案',
--   30,
--   30
-- );

-- ========================================
-- 查詢範例
-- ========================================

-- 查詢用戶的所有訂單
-- SELECT * FROM orders WHERE user_id = 'user-uuid' ORDER BY created_at DESC;

-- 查詢已完成的訂單
-- SELECT * FROM orders WHERE status = 'completed' ORDER BY paid_at DESC;

-- 查詢特定 LINE Pay 交易
-- SELECT * FROM orders WHERE transaction_id = 'line-pay-transaction-id';
