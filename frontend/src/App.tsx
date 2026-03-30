// import { useEffect, useState } from "react";

// type Work = {
//   id: string;
//   title: string;
//   author: string;
//   age: string;
//   concepts: Record<string, number>;
// };

// export default function App() {
//   const API = "http://127.0.0.1:8000";

//   const [status, setStatus] = useState("проверяем backend...");
//   const [userId, setUserId] = useState("user1");
//   const [age, setAge] = useState("16+");
//   const [conceptsJson, setConceptsJson] = useState(
//     JSON.stringify(
//       { любовь: 0.9, смысл_жизни: 0.8, нравственный_выбор: 0.7, свобода: 0.6 },
//       null,
//       2
//     )
//   );

//   const [recs, setRecs] = useState<Work[]>([]);
//   const [err, setErr] = useState<string>("");

//   useEffect(() => {
//     fetch(`${API}/health`)
//       .then((r) => r.json())
//       .then((d) => setStatus("backend: " + d.status))
//       .catch(() => setStatus("backend недоступен"));
//   }, []);

//   async function upsertProfile() {
//     setErr("");
//     try {
//       const concepts = JSON.parse(conceptsJson);

//       const r = await fetch(`${API}/profile`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           id: userId,
//           age,
//           concepts,
//         }),
//       });

//       if (!r.ok) throw new Error(`POST /profile failed: ${r.status}`);
//       alert("Профиль сохранён");
//     } catch (e: any) {
//       setErr(String(e?.message ?? e));
//     }
//   }

//   async function getRecommendations() {
//     setErr("");
//     try {
//       const r = await fetch(`${API}/recommendations/${encodeURIComponent(userId)}?top_n=10`);
//       if (!r.ok) throw new Error(`GET /recommendations failed: ${r.status}`);
//       const data: Work[] = await r.json();
//       setRecs(data);
//     } catch (e: any) {
//       setErr(String(e?.message ?? e));
//     }
//   }

//   return (
//     <div style={{ padding: 20, fontFamily: "Arial" }}>
//       <h1>ReadingPlatform</h1>
//       <p>{status}</p>

//       <h2>Профиль</h2>
//       <div style={{ display: "grid", gap: 8, maxWidth: 700 }}>
//         <label>
//           userId:
//           <input
//             style={{ marginLeft: 8, width: 200 }}
//             value={userId}
//             onChange={(e) => setUserId(e.target.value)}
//           />
//         </label>

//         <label>
//           age:
//           <input
//             style={{ marginLeft: 8, width: 80 }}
//             value={age}
//             onChange={(e) => setAge(e.target.value)}
//           />
//         </label>

//         <label>
//           concepts (JSON):
//           <textarea
//             style={{ width: "100%", height: 140, display: "block" }}
//             value={conceptsJson}
//             onChange={(e) => setConceptsJson(e.target.value)}
//           />
//         </label>

//         <div style={{ display: "flex", gap: 10 }}>
//           <button onClick={upsertProfile}>Сохранить профиль</button>
//           <button onClick={getRecommendations}>Получить рекомендации</button>
//         </div>

//         {err && <div style={{ color: "crimson" }}>Ошибка: {err}</div>}
//       </div>

//       <h2>Рекомендации</h2>
//       {recs.length === 0 ? (
//         <p>Пока пусто. Нажми “Получить рекомендации”.</p>
//       ) : (
//         <ol>
//           {recs.map((w) => (
//             <li key={w.id} style={{ marginBottom: 10 }}>
//               <b>{w.title}</b> — {w.author} <span style={{ opacity: 0.7 }}>({w.age})</span>
//               {w.concepts && Object.keys(w.concepts).length > 0 && (
//                 <div style={{ fontSize: 12, opacity: 0.85 }}>
//                   Концепты:{" "}
//                   {Object.entries(w.concepts)
//                     .sort((a, b) => b[1] - a[1])
//                     .slice(0, 6)
//                     .map(([k, v]) => `${k}=${v.toFixed(2)}`)
//                     .join(", ")}
//                 </div>
//               )}
//             </li>
//           ))}
//         </ol>
//       )}
//     </div>
//   );
// }
