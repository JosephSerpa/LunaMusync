import { createApp } from "./app.js";

const port = Number(process.env.PORT || 3001);
const server = createApp();
server.listen(port, "0.0.0.0", () => {
  console.log(`Luna Core disponible en http://localhost:${port}`);
});
