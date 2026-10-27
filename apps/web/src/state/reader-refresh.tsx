import React, { createContext, useContext } from 'react';

const ReaderRefreshContext = createContext(false);

export function ReaderRefreshProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return <ReaderRefreshContext.Provider value={value}>{children}</ReaderRefreshContext.Provider>;
}

export function useReaderRefresh(): boolean {
  return useContext(ReaderRefreshContext);
}
