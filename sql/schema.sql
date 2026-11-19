-- 课堂签到选座 · 数据库结构
-- 目标库：WorkBuddy Cloud Service（托管 PostgreSQL，PostgREST）
-- 说明：逐条执行，每条一句；本文件仅作结构与迁移留档。

-- ---------------------------------------------------------------- 座位
CREATE TABLE seats (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seat_no      TEXT        NOT NULL UNIQUE,      -- 形如 3-7，即 3 排 7 座
  row_no       INT         NOT NULL,             -- 1..12，第 1 排靠讲台
  col_no       INT         NOT NULL,             -- 1..10，第 5/6 列之间是过道
  status       TEXT        NOT NULL DEFAULT 'free',
  student_name TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE seats IS '教室座位，签到时由 checkin() 原子占用';

-- ---------------------------------------------------------------- 名单
CREATE TABLE roster (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT        NOT NULL UNIQUE,
  seat_no       TEXT,
  checked_in_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE roster IS '班级名单，seat_no 为空表示还没签到';

-- ---------------------------------------------------------------- 重置口令
-- 不放策略、不开任何 grant：只有 SECURITY DEFINER 函数能读
CREATE TABLE room_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO room_config (key, value) VALUES ('reset_key', '2468');

-- ---------------------------------------------------------------- 权限
-- 两张表对匿名用户只读；写操作一律走下面的函数
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_config ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.seats  TO authenticated, anon;
GRANT SELECT ON TABLE public.roster TO authenticated, anon;

CREATE POLICY seats_read_all  ON public.seats  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY roster_read_all ON public.roster FOR SELECT TO authenticated, anon USING (true);

-- ---------------------------------------------------------------- 签到即分座
-- 行锁保证并发下不会两个人拿到同一个座位；重复签到返回原座位
CREATE OR REPLACE FUNCTION checkin(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_stu  roster%ROWTYPE;
  v_seat seats%ROWTYPE;
BEGIN
  SELECT * INTO v_stu FROM roster WHERE name = p_name FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_IN_ROSTER');
  END IF;

  IF v_stu.seat_no IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'name', v_stu.name, 'seat_no', v_stu.seat_no);
  END IF;

  SELECT * INTO v_seat FROM seats
   WHERE status = 'free'
   ORDER BY random()
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT');
  END IF;

  UPDATE seats
     SET status = 'taken', student_name = p_name, updated_at = now()
   WHERE id = v_seat.id;

  UPDATE roster
     SET seat_no = v_seat.seat_no, checked_in_at = now()
   WHERE id = v_stu.id;

  RETURN jsonb_build_object(
    'ok', true, 'already', false, 'name', p_name,
    'seat_no', v_seat.seat_no, 'row_no', v_seat.row_no, 'col_no', v_seat.col_no
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.checkin(text) TO authenticated, anon;

-- ---------------------------------------------------------------- 重置本场
-- 破坏性操作，必须带口令；口令存在 room_config，不写死在这里
CREATE OR REPLACE FUNCTION reset_session(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ok    boolean;
  v_seats int;
  v_stu   int;
BEGIN
  SELECT EXISTS(SELECT 1 FROM room_config WHERE key = 'reset_key' AND value = p_key) INTO v_ok;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_KEY');
  END IF;

  UPDATE seats SET status = 'free', student_name = NULL, updated_at = now() WHERE status <> 'free';
  GET DIAGNOSTICS v_seats = ROW_COUNT;

  UPDATE roster SET seat_no = NULL, checked_in_at = NULL WHERE seat_no IS NOT NULL;
  GET DIAGNOSTICS v_stu = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'seats_freed', v_seats, 'students_reset', v_stu);
END
$fn$;

GRANT EXECUTE ON FUNCTION public.reset_session(text) TO authenticated, anon;

-- ---------------------------------------------------------------- 座位种子
-- 12 排 × 10 列 = 120 个座位
INSERT INTO seats (seat_no, row_no, col_no)
SELECT r || '-' || c, r, c
FROM generate_series(1, 12) AS r, generate_series(1, 10) AS c;

-- 名单见 sql/roster-sample.sql
