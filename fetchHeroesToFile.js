const fetch = require('node-fetch');
const fs = require('fs');

const STRATZ_API_URL = 'https://api.stratz.com/graphql';
const ICON_BASE_URL = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/heroes';

const query = `
  query {
    constants {
      heroes {
        id
        shortName
        displayName
        roles { roleId }
        stats { primaryAttribute }
      }
    }
  }
`;

async function fetchAndWriteHeroData() {
    try {
        const response = await fetch(STRATZ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'STRATZ_API',
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJTdWJqZWN0IjoiYzAyNzI3YTktZGYxNS00Yjg4LWEwMWEtOGUzM2U4ZmI4NGZkIiwiU3RlYW1JZCI6IjE3ODAwNzg0NiIsIm5iZiI6MTc1MTA3NDgyMCwiZXhwIjoxNzgyNjEwODIwLCJpYXQiOjE3NTEwNzQ4MjAsImlzcyI6Imh0dHBzOi8vYXBpLnN0cmF0ei5jb20ifQ.0MsuzymNg-DZbknEwZ5vPBYkqQEjMzIDp1qP_2KBXn8'
            },
            body: JSON.stringify({ query })
            });

        const json = await response.json();
        if (json.errors) {
            console.error('GraphQL error:', json.errors);
            return;
        }

        const heroes = json.data.constants.heroes;

        const formattedHeroes = heroes.map(hero => ({
            HeroId: hero.id,
            name: hero.displayName,
            roles: hero.roles.map(r => r.roleId.charAt(0) + r.roleId.slice(1).toLowerCase()),
            icon_url: `${ICON_BASE_URL}/${hero.shortName}_full.png`,
            primaryAttribute: hero.stats.primaryAttribute
        }));

        fs.writeFileSync ('heroes.json', JSON.stringify(formattedHeroes, null, 2), 'utf-8');
        console.log(`Successfully wrote ${formattedHeroes.length} heroes to heroes.json`);
    } catch (err) {
        console.error('Failed to fetch or write hero data:', err);
    }
}

fetchAndWriteHeroData();