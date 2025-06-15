-- Quick permissions fix for zalint user
-- Run this in your PostgreSQL client connected to the 'depenses_management' database

-- Connect to the correct database first if needed:
-- \c depenses_management;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO zalint;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO zalint;
GRANT USAGE ON SCHEMA public TO zalint;
GRANT CREATE ON SCHEMA public TO zalint;

-- Permissions on future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO zalint;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO zalint;

-- Also grant database-level permissions
GRANT CONNECT ON DATABASE depenses_management TO zalint;

SELECT 'Permissions granted to zalint successfully!' as message; 