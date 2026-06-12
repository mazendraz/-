import { useRouteError, Link } from "react-router-dom";

export default function ErrorPage() {
  const error = useRouteError() as { statusText?: string; message?: string } | null;
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center text-center px-6">
      <span className="material-symbols-outlined text-outline text-[64px] mb-4">error</span>
      <h1 className="text-headline-lg font-headline-lg text-on-surface mb-2">Something went wrong</h1>
      <p className="text-body-md font-body-md text-outline mb-6 max-w-md">
        {error?.statusText ?? error?.message ?? "An unexpected error occurred."}
      </p>
      <Link to="/" className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-[15px] hover:bg-primary-container transition-colors">
        Go Home
      </Link>
    </div>
  );
}
