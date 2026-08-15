import { QueryClient } from "@tanstack/react-query";
import { experimental_createQueryPersister } from "@tanstack/react-query-persist-client";

const { persisterFn } = experimental_createQueryPersister({
  storage: window.localStorage,
  maxAge: 10 * 60 * 1000, // 10 minutes
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // always refetch in background; persisted data is shown instantly then refreshed
      gcTime: 10 * 60 * 1000,
      persister: persisterFn,
    },
  },
});

export default queryClient;
