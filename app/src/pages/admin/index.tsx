// The admin dashboard used to be one ~500-line component here (NAV-06) — its
// 10 tabs are now real nested routes (see main.tsx), each its own lazily
// loaded page under `./tabs/`, sharing this one layout.
export { default } from "./AdminLayout";
