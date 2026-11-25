-- LINY APIから取り込む3テーブル。friend_id はLINY内部のID。
-- 氏名・LINEのuid・メモは保存しない（分析に使わない個人情報を置かないため）。

create table if not exists liny_tag (
  tag_id    bigint primary key,
  name      text not null,
  folder    text,
  synced_at timestamptz not null
);

create table if not exists liny_friend (
  friend_id      bigint primary key,
  created_at     timestamptz not null,   -- 友だち追加日時。シナリオのDay0の起点
  is_blocked     boolean not null,
  display_status text,                   -- normal / block / hide
  synced_at      timestamptz not null
);
create index if not exists liny_friend_created_at_idx on liny_friend (created_at);
create index if not exists liny_friend_blocked_idx on liny_friend (is_blocked);

create table if not exists liny_friend_tag (
  friend_id   bigint not null,
  tag_id      bigint not null,
  attached_at timestamptz,               -- そのタグが付いた日時。工程の到達日になる
  primary key (friend_id, tag_id)
);
create index if not exists liny_friend_tag_tag_idx on liny_friend_tag (tag_id);
create index if not exists liny_friend_tag_attached_idx on liny_friend_tag (attached_at);
