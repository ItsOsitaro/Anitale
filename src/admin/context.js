import { createContext, useContext } from 'react';

export const AdminContext = createContext({ t: (key) => key, lang: 'fa', toast: () => {}, confirm: async () => true, can: () => true, me: null, overview: null });
export const useAdmin = () => useContext(AdminContext);
