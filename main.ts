import {existsSync} from "https://deno.land/std/fs/mod.ts";

const folderPath = "data";
const filePath = folderPath + "/data.json";

const data = await getData();
data.token = await validateToken(data.token);
await Deno.writeTextFile(filePath, JSON.stringify(data));

while (true) {
    const user = await getValidUser(data.token);
    showEmailAccount(user);
    console.log("Searching for more mails ...");
    const repos = (await getRepos(user.login, data.token)).filter((repo: any) =>
        !repo.private && !repo.fork
    );
    console.log("Found " + repos.length + " public repositories not forked");
    let results: string[] = [];
    for (const repo of repos) {
        results = [
            ...results,
            ...await getMailsForRepo(repo.clone_url, repo.name),
        ];
    }
    results.sort((a, b) => a.localeCompare(b));
    console.log([...new Set(results)].filter((s) => s));
}

async function getMailsForRepo(url: string, repoName: string) {
    const result = [];
    const repoPath = folderPath + "/" + repoName;
    try {
        await Deno.remove(repoPath, { recursive: true });
    } catch (e) {
        // nothing
    }
    console.log("Cloning " + repoName + " ...");
    await (new Deno.Command("git", { args: ["clone", url, repoPath] }))
        .output();
    const { stdout, stderr } = await (new Deno.Command("git", {
        args: [
            "-C",
            repoPath,
            "shortlog",
            "HEAD",
            "--summary",
            "--numbered",
            "--email",
        ],
    })).output();
    let resultString = new TextDecoder().decode(stdout);
    resultString = resultString.replace(/^ *\d+ */gm, "");
    const array = resultString.split("\n");
    for (let string of array) {
        string = string.replace(/^\\t/, "");
        result.push(string.trim());
    }

    try {
        await Deno.remove(repoPath, { recursive: true });
    } catch (e) {
        // nothing
    }
    return result;
}

async function getRepos(name: string, token: string) {
    const resp = await fetch(
        "https://api.github.com/users/" + name + "/repos",
        {
            headers: {
                "Authorization": "Bearer " + token,
            },
        },
    );
    return await resp.json();
}

// deno-lint-ignore no-explicit-any
function showEmailAccount(user: any) {
    if (user.email === null) {
        console.log("User has no mail in his account");
    } else {
        console.log("User has a mail in his account `" + user.email + "`");
    }
}

async function getValidUser(token: string) {
    while (true) {
        const name = prompt(
            "Please enter the username of the github user:",
        );
        const resp = await fetch("https://api.github.com/users/" + name, {
            headers: {
                "Authorization": "Bearer " + token,
            },
        });
        if (resp.status === 200) {
            return await resp.json();
        }
        console.log(
            "It seems like this user doesn't exists, response code: " +
                resp.status,
        );
    }
}

async function getData() {
    if (!existsSync(folderPath)) {
        await Deno.mkdir(folderPath);
    }
    let file: Deno.FsFile;
    if (!existsSync(filePath)) {
        file = await Deno.create(filePath);
        await file.write(new TextEncoder().encode("{}"));
    }
    return JSON.parse(await Deno.readTextFile(filePath));
}

async function validateToken(token: string | undefined | null) {
    let tokenValid = false;
    if (token) {
        const { valid } = await checkTokenValid(token);
        tokenValid = valid;
    }
    while (!tokenValid) {
        console.log(
            "Go to https://github.com/settings/tokens/new to generate a token",
        );
        const token = prompt("Please insert your token:");
        const { status, valid } = await checkTokenValid(token);
        tokenValid = valid;
        if (!valid) {
            console.log(
                "It seems like your token is not valid, response code: " +
                    status,
            );
        } else {
            return token;
        }
    }
    return token;
}

async function checkTokenValid(token: string | null) {
    if (typeof token !== "string") {
        return { status: 0, valid: false };
    }
    const resp = await fetch("https://api.github.com/octocat", {
        headers: {
            "Authorization": "Bearer " + token,
        },
    });
    return { status: resp.status, valid: resp.status === 200 };
}
