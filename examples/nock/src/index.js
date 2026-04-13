/**
 * Fetch a user by ID from the API.
 *
 * @param {string} baseUrl
 * @param {number} id
 * @returns {Promise<{ id: number, name: string }>}
 */
export async function getUser(baseUrl, id) {
  const res = await fetch(`${baseUrl}/users/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
