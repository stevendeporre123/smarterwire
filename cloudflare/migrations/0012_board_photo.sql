-- Meerdere foto's per kast: extra kastfoto's, foto van de beschrijvingen/legende, bekabeling, typeplaatje.
CREATE TABLE board_photo (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES board(id), asset_id TEXT NOT NULL REFERENCES asset(id),
  kind TEXT NOT NULL DEFAULT 'kast',             -- kast | beschrijving | bekabeling | typeplaatje | overig
  note TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_board_photo_board ON board_photo(board_id);
