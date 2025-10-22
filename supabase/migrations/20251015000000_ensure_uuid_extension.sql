-- ============================================
-- Ensure UUID Extension
-- Ensures uuid-ossp extension is available for all migrations
-- ============================================

create extension if not exists "uuid-ossp";
