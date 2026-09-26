import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type GitHubAsset = {
  name: string;
  browser_download_url: string;
  download_count: number;
};

type GitHubRelease = {
  tag_name: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubAsset[];
};

const RELEASES_URL =
  "https://api.github.com/repos/SkyLex56930/gamemate-releases/releases?per_page=100";
const LAUNCHER_ASSET = "launcher_x64-setup.exe";
const FALLBACK_DOWNLOAD =
  "https://github.com/SkyLex56930/gamemate-releases/releases/latest/download/launcher_x64-setup.exe";

async function getOnlineUsers() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) return 0;

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/get_public_site_stats`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      },
    );

    if (!response.ok) return 0;

    const data = (await response.json()) as { online_users?: number };
    return Math.max(0, Number(data.online_users ?? 0));
  } catch {
    return 0;
  }
}

export async function GET() {
  let latestVersion = "—";
  let publishedAt: string | null = null;
  let downloadUrl = FALLBACK_DOWNLOAD;
  let downloads = 0;

  try {
    const response = await fetch(RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "GameMate-Website",
      },
      next: { revalidate: 60 },
    });

    if (response.ok) {
      const releases = (await response.json()) as GitHubRelease[];
      const published = releases.filter(
        (release) => !release.draft && !release.prerelease,
      );

      for (const release of published) {
        const launcher = release.assets.find(
          (asset) => asset.name === LAUNCHER_ASSET,
        );

        if (launcher) {
          downloads += Number(launcher.download_count ?? 0);

          if (latestVersion === "—") {
            latestVersion = release.tag_name || "—";
            publishedAt = release.published_at;
            downloadUrl = launcher.browser_download_url || FALLBACK_DOWNLOAD;
          }
        }
      }
    }
  } catch {}

  const onlineUsers = await getOnlineUsers();

  return NextResponse.json(
    {
      onlineUsers,
      downloads,
      latestVersion,
      downloadUrl,
      publishedAt,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
