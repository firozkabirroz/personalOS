import { post } from '/js/api.js';
import { formModal, toast } from '/js/ui.js';
import { currentUser } from './app.js';

export function changeLoginModal(u, { onSaved } = {}) {
  const isSelf = Number(u.id) === Number(currentUser?.id);
  formModal({
    title: `Change login — @${u.username}`,
    fields: [
      { key: 'username', label: 'Username', placeholder: '3–32 characters' },
      ...(isSelf ? [{ key: 'currentPassword', label: 'Current password', type: 'password', placeholder: 'Required to save' }] : []),
      { key: 'password', label: 'New password', type: 'password', placeholder: 'Leave blank to keep current' },
    ],
    values: { username: u.username },
    submitLabel: 'Save login',
    onSubmit: async (v) => {
      const body = {};
      const nextUser = (v.username || '').trim().toLowerCase();
      if (nextUser && nextUser !== u.username) body.username = nextUser;
      if (v.password) body.password = v.password;
      if (isSelf) body.currentPassword = v.currentPassword;
      if (!body.username && !body.password) throw new Error('Enter a new username or password');
      const result = await post(`/admin/users/${u.id}/credentials`, body);
      toast('Login updated ✓');
      if (isSelf && result?.user?.username && result.user.username !== currentUser.username) {
        location.reload();
        return;
      }
      onSaved?.();
    },
  });
}
