import "jsr:@std/dotenv/load";
import Repo from "./data.ts";
const port = Number(Deno.env.get("PORT") ?? 3000);
const gh_username = Deno.env.get("GITHUB_USERNAME") ?? "";
const endpoint = `https://api.github.com/users/${gh_username}/repos`;
const db = await Deno.openKv();
const repoNames: string[] = [];
const expireInMinutes = 30;

async function fetchData<Data>(url: string = endpoint):Promise<Data | undefined> {
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log(data);
    
    return data;
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

async function updateDB(): Promise<void> {
  try {
    if (!Deno.env.get("DEBUG")) {
      const data = await fetchData<Repo[]>();
      if (data) {
        for (let i = 0; i < data.length; i++) {
          const repo = data[i];
          db.set([repo.full_name, "repo"], repo);
          repoNames.push(repo.full_name);
        }
      }
      return;
    }
    const fileContent = await Deno.readTextFile("output.txt");
    const data: Repo[] = JSON.parse(fileContent);
    for (let i = 0; i < data.length; i++) {
      const repo = data[i];
      db.set([repo.full_name, "repo"], repo, {
        expireIn: expireInMinutes * 1000,
      });
      repoNames.push(repo.full_name);
    }
  } catch (error) {
    console.error(error);
  }
}

async function getRepo(full_name: string):Promise<Deno.KvEntryMaybe<Repo> | undefined> {
  try {
    const data = await db.get<Repo>([full_name, "repo"]);
    return data;
  } catch (error) {
    console.error("error getting single repo ",error);
  }
}

async function server(req: Request) {
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname === "/") {
    const repos: Repo[] = [];
    for await (const full_name of repoNames) {
      const repo = await getRepo(full_name);
      if (repo && repo.value) {
        repos.push(repo.value);
      }
    }
    return new Response(JSON.stringify(repos), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }
  return new Response("", {
    status: 404,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

await updateDB();

setInterval(async () => {
  await updateDB();
  console.log("updated");
}, (1000*60)*expireInMinutes);

Deno.serve({ port, hostname: "127.0.0.1" }, server);
