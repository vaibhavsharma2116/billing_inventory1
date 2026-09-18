# Fix admin user-management authorization

## What will change
- Add a role guard to the Company Admin route so only `super_admin` users can render admin-only queries and the Users tab.
- Redirect any other authenticated role to its own dashboard instead of allowing an admin server call to fail and blank the page.
- Preserve the existing server-side `super_admin` verification for secure, defense-in-depth authorization.
- Verify the admin route and Users tab in the live preview and confirm the build remains healthy.

## Technical details
- Use the existing `useMe` role query and `roleHome` mapping in a small route wrapper.
- Mount the existing admin dashboard only after the role query confirms `super_admin`, preventing `listAppUsers` from firing for unauthorized sessions.
