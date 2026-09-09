import { useEffect, useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { isAdminUser } from '../services/adminService';

/**
 * Role gate for the admin suite. `isAdmin` becomes true only when the signed-in
 * user is listed in admin/roles (operator-provisioned — see firestore.rules).
 */
export function useAdmin() {
  const { user } = useAuthContext();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      try {
        setIsAdmin(await isAdminUser(user.uid));
      } catch (error) {
        console.error('Admin role check failed:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [user]);

  return { isAdmin, loading };
}