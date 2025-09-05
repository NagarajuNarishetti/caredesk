import { useEffect, useState } from "react";
import API from "../lib/api";

export default function Users() {
  const [users, setUsers] = useState([]);
  

  useEffect(() => {
    API.get("/users")
      .then(res => setUsers(res.data))
      .catch(err => console.error("Error fetching users", err));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Users</h1>
      <ul className="space-y-3">
        {users.map(user => (
          <li key={user.id} className="p-4 bg-gray-100 rounded shadow">
            <strong>{user.username}</strong> ({user.email}) — {user.role}
          </li>
        ))}
      </ul>
    </div>
  );
}
