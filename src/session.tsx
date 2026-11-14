import { MutationCache, QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@ui-sdk/react/button";
import { createContext, use } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { api, ApiError } from "./api";
import type { User } from "./api";
import { DEMO_PASSWORD } from "./demoAccounts";

const sessionKey = ["session"] as const;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleApiError }),
  mutationCache: new MutationCache({ onError: handleApiError }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        failureCount < 2 && error instanceof ApiError && (error.code === "network" || error.code === "server"),
    },
  },
});

/** Signs the user out locally when the server says the session is gone. */
export function handleApiError(error: unknown) {
  if (error instanceof ApiError && error.code === "unauthenticated") endSession();
}

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: async (): Promise<User | null> => {
      try {
        return (await api.me()).user;
      } catch (error) {
        if (error instanceof ApiError && error.code === "unauthenticated") return null;
        throw error;
      }
    },
    staleTime: Infinity,
  });
}

function startSession(user: User) {
  queryClient.setQueryData<User | null>(sessionKey, user);
  // Everything else in the cache belongs to the previous user.
  void queryClient.resetQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] });
}

function endSession() {
  queryClient.setQueryData<User | null>(sessionKey, null);
}

export async function signIn(email: string, password: string) {
  const { user } = await api.login(email, password);
  startSession(user);
}

export async function signOut() {
  try {
    await api.logout();
  } finally {
    endSession();
  }
}

export async function switchUser(email: string) {
  await api.logout().catch(() => undefined);
  try {
    await signIn(email, DEMO_PASSWORD);
  } catch (error) {
    endSession();
    throw error;
  }
}

const UserContext = createContext<User | null>(null);

export function useUser(): User {
  const user = use(UserContext);
  if (!user) throw new Error("useUser is only available inside RequireSession");
  return user;
}

export function RequireSession() {
  const session = useSession();
  const location = useLocation();

  if (session.data === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 text-slate-600">
        {session.isError ? (
          <div className="text-center" role="alert">
            <p>{session.error.message}</p>
            <Button className="mt-3" onClick={() => session.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <p>Loading...</p>
        )}
      </div>
    );
  }
  if (!session.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return (
    <UserContext value={session.data}>
      <Outlet />
    </UserContext>
  );
}
