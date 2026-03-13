-- ========================================
-- skin_analysis_records 資料表 (完整定義)
-- 儲存每次 AI 肌膚分析的結果
-- ========================================

CREATE TABLE IF NOT EXISTS skin_analysis_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 圖片
  image_url TEXT,

  -- 整體評分
  overall_score INT NOT NULL,    -- 0-100
  skin_age INT,                  -- 估算肌膚年齡

  -- ── 傳統計算分數（由後端演算法推導）──────────────
  hydration_score    INT,   -- 水潤度
  radiance_score     INT,   -- 光澤度
  firmness_score     INT,   -- 緊緻度
  texture_score      INT,   -- 膚質均勻度
  wrinkles_score     INT,   -- 抗皺分數
  pores_score        INT,   -- 毛孔分數
  pigmentation_score INT,   -- 色素分數

  -- ── 六力分數（直接來自 Pro API score_info）───────
  -- 這六個分數對應 SkinAnalysisReport 六力雷達圖
  score_oil         INT,   -- 油：oily_intensity_score
  score_moisture    INT,   -- 水：water_score
  score_pigment     INT,   -- 斑：melanin_score
  score_wrinkle     INT,   -- 皺：wrinkle_score
  score_sensitivity INT,   -- 敏：sensitivity_score
  score_acne        INT,   -- 痘：acne_score（含黑頭/粉刺調整後）

  -- 完整 Pro API 原始資料（JSONB）
  full_analysis_data JSONB,   -- 含 result.score_info / face_maps / sensitivity 等

  -- 建議與保養方案
  recommendations JSONB,      -- 列表，每項為字串或物件
  skincare_routine JSONB,     -- { morning, evening, weekly, products, lifestyle }

  -- 輔助欄位
  analysis_hour INT,          -- 台灣時區小時 (0-23)，用於統計分析時段
  feng_shui_element TEXT,     -- 五行元素（選填）
  feng_shui_blessing TEXT,    -- 五行祝語（選填）
  is_favorite BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 索引 ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sar_user_id    ON skin_analysis_records(user_id);
CREATE INDEX IF NOT EXISTS idx_sar_created_at ON skin_analysis_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sar_overall    ON skin_analysis_records(overall_score);
-- 支援 GIN 索引讓 full_analysis_data 內部欄位可加速查詢
CREATE INDEX IF NOT EXISTS idx_sar_full_data  ON skin_analysis_records USING gin(full_analysis_data);

-- ── 自動更新 updated_at ──────────────────────────────
CREATE OR REPLACE FUNCTION update_skin_analysis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sar_updated_at_trigger ON skin_analysis_records;
CREATE TRIGGER sar_updated_at_trigger
BEFORE UPDATE ON skin_analysis_records
FOR EACH ROW
EXECUTE FUNCTION update_skin_analysis_updated_at();


-- ========================================
-- 【遷移腳本】為已存在的資料表新增欄位
-- 在 Nhost/Hasura console 或 psql 執行此段即可
-- ========================================

DO $$
BEGIN
  -- updated_at（若原表無此欄位，先補上，避免 trigger 報錯）
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'skin_analysis_records' AND column_name = 'updated_at') THEN
    ALTER TABLE skin_analysis_records ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added column: updated_at';
  END IF;

  -- score_oil
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'skin_analysis_records' AND column_name = 'score_oil') THEN
    ALTER TABLE skin_analysis_records ADD COLUMN score_oil INT;
    RAISE NOTICE 'Added column: score_oil';
  END IF;

  -- score_moisture
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'skin_analysis_records' AND column_name = 'score_moisture') THEN
    ALTER TABLE skin_analysis_records ADD COLUMN score_moisture INT;
    RAISE NOTICE 'Added column: score_moisture';
  END IF;

  -- score_pigment
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'skin_analysis_records' AND column_name = 'score_pigment') THEN
    ALTER TABLE skin_analysis_records ADD COLUMN score_pigment INT;
    RAISE NOTICE 'Added column: score_pigment';
  END IF;

  -- score_wrinkle
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'skin_analysis_records' AND column_name = 'score_wrinkle') THEN
    ALTER TABLE skin_analysis_records ADD COLUMN score_wrinkle INT;
    RAISE NOTICE 'Added column: score_wrinkle';
  END IF;

  -- score_sensitivity
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'skin_analysis_records' AND column_name = 'score_sensitivity') THEN
    ALTER TABLE skin_analysis_records ADD COLUMN score_sensitivity INT;
    RAISE NOTICE 'Added column: score_sensitivity';
  END IF;

  -- score_acne
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'skin_analysis_records' AND column_name = 'score_acne') THEN
    ALTER TABLE skin_analysis_records ADD COLUMN score_acne INT;
    RAISE NOTICE 'Added column: score_acne';
  END IF;
END $$;


-- ========================================
-- 回填：從已存在的 full_analysis_data 計算六力分數
-- 對尚未有六力分數的歷史記錄補值
-- 先暫時移除 trigger 避免 updated_at 欄位不存在時的衝突
-- ========================================

-- 安全移除舊 trigger（若存在）
DROP TRIGGER IF EXISTS sar_updated_at_trigger ON skin_analysis_records;

-- 回填六力分數
UPDATE skin_analysis_records
SET
  score_oil         = (full_analysis_data -> 'result' -> 'score_info' ->> 'oily_intensity_score')::INT,
  score_moisture    = (full_analysis_data -> 'result' -> 'score_info' ->> 'water_score')::INT,
  score_pigment     = (full_analysis_data -> 'result' -> 'score_info' ->> 'melanin_score')::INT,
  score_wrinkle     = (full_analysis_data -> 'result' -> 'score_info' ->> 'wrinkle_score')::INT,
  score_sensitivity = (full_analysis_data -> 'result' -> 'score_info' ->> 'sensitivity_score')::INT,
  score_acne        = (full_analysis_data -> 'result' -> 'score_info' ->> 'acne_score')::INT
WHERE
  score_oil IS NULL
  AND full_analysis_data -> 'result' -> 'score_info' IS NOT NULL;

-- 重新建立 trigger（此時 updated_at 欄位已確保存在）
CREATE OR REPLACE FUNCTION update_skin_analysis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sar_updated_at_trigger
BEFORE UPDATE ON skin_analysis_records
FOR EACH ROW
EXECUTE FUNCTION update_skin_analysis_updated_at();
