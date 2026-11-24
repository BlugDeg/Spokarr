// Signed-in user and server configuration, shared by all pages
export const session = { user: null, status: null, config: {} };
export const isAdmin = () => session.user?.role === 'admin';
export const can = (perm) => isAdmin() || !!session.user?.permissions?.[perm];
