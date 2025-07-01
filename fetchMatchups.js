const STRATZ_API_URL = 'https://api.stratz.com/graphql';

async function fetchMatchups(heroId) {
  const matchupQuery = `
    query HeroVsHeroMatchup($heroId: Short!) {
      heroStats {
        heroVsHeroMatchup(heroId: $heroId) {
          advantage {
            vs {
              heroId2
              synergy
            }
            with {
              heroId2
              synergy
            }
          }
        }
      }
    }
  `;

  try {
    const variables = { heroId };

    const response = await fetch(STRATZ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "STRATZ_API",
        Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJTdWJqZWN0IjoiYzAyNzI3YTktZGYxNS00Yjg4LWEwMWEtOGUzM2U4ZmI4NGZkIiwiU3RlYW1JZCI6IjE3ODAwNzg0NiIsIm5iZiI6MTc1MTA3NDgyMCwiZXhwIjoxNzgyNjEwODIwLCJpYXQiOjE3NTEwNzQ4MjAsImlzcyI6Imh0dHBzOi8vYXBpLnN0cmF0ei5jb20ifQ.0MsuzymNg-DZbknEwZ5vPBYkqQEjMzIDp1qP_2KBXn8`, // token shortened
      },
      body: JSON.stringify({ query: matchupQuery, variables }),
    });

    const json = await response.json();

    if (json.errors) {
      console.error("GraphQL errors:", json.errors);
      return;
    }

    const advantageData = json?.data?.heroStats?.heroVsHeroMatchup?.advantage?.[0];

    if (!advantageData) {
      console.error("Missing matchup data for heroId:", heroId);
      return;
    }

    const vsArray = Array.isArray(advantageData.vs) ? advantageData.vs : [];
    const withArray = Array.isArray(advantageData.with) ? advantageData.with : [];

    return {
      heroId,
      vs: vsArray,
      with: withArray,
    };

  } catch (err) {
    console.error("Error fetching matchups:", err);
  }
}

module.exports = fetchMatchups;