// Load the real .env so DATABASE_URL (Docker Postgres) and JWT_SECRET are set
// before route handlers import the prisma singleton.
import "dotenv/config";
