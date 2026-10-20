import { createContext, useContext } from 'react';

export const AdminContext = createContext({ t: (key) => key, lang: 'fa', toast: () => {} });
export const useAdmin = () => useContext(AdminContext);
