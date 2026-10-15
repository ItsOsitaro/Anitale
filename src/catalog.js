import axios from 'axios';

// Jikan API base URL
const JIKAN_API_BASE = 'https://api.jikan.moe/v4';

// Function to load anime catalog from Jikan API
export const loadAnimeCatalog = async () => {
  try {
    // Fetch top anime items from Jikan API
    const response = await axios.get(`${JIKAN_API_BASE}/top/anime`, {
      params: {
        limit: 50, // Get 50 top anime
      }
    });
    
    // Process the API response to match our expected data structure
    return response.data.data.map((anime) => ({
      slug: anime.slug,
      title: anime.title,
      image: anime.images?.jpg?.image_url || anime.images?.webp?.image_url || '',
      category: anime.type || 'TV',
      year: anime.year ? anime.year.toString() : 'Unknown',
      genres: anime.genres?.map(genre => genre.name) || [],
      sampleScore: anime.score || 0,
      synopsis: anime.synopsis || 'No description available.',
      alternativeTitles: anime.titles || [],
      format: anime.type || 'TV',
      episodes: anime.episodes || 0,
      status: anime.status || 'Unknown',
      aired: anime.aired ? anime.aired.from : null,
      duration: anime.duration || 'Unknown',
      rating: anime.rating || 'Unknown'
    }));
  } catch (error) {
    console.error('Error loading anime catalog from API:', error);
    
    // Fallback to original mock data in case of API failure
    return [
      {
        slug: 'attack-on-titan',
        title: 'Attack on Titan',
        image: 'https://cdn.myanimelist.net/images/anime/10/80745.jpg',
        category: 'TV',
        year: '2013',
        genres: ['Action', 'Drama', 'Fantasy'],
        sampleScore: 9.0,
        synopsis: 'In a world where humanity lives behind walled cities...',
        alternativeTitles: [{ type: 'Default', title: 'Shingeki no Kyojin' }],
        format: 'TV',
        episodes: 88,
        status: 'Finished Airing',
        aired: '2013-04-07 to 2023-03-26',
        duration: '24 min. per ep.',
        rating: 'R'
      },
      {
        slug: 'one-piece',
        title: 'One Piece',
        image: 'https://cdn.myanimelist.net/images/anime/10/80745.jpg',
        category: 'TV',
        year: '1999',
        genres: ['Action', 'Adventure', 'Comedy'],
        sampleScore: 9.2,
        synopsis: 'Monkey D. Luffy and his pirate crew explore the Grand Line...',
        alternativeTitles: [{ type: 'Default', title: 'One Piece' }],
        format: 'TV',
        episodes: 1000,
        status: 'Currently Airing',
        aired: '1999-10-20 to Present',
        duration: '24 min. per ep.',
        rating: 'PG'
      },
      {
        slug: 'demon-slayer',
        title: 'Demon Slayer',
        image: 'https://cdn.myanimelist.net/images/anime/10/80745.jpg',
        category: 'TV',
        year: '2019',
        genres: ['Action', 'Supernatural', 'Adventure'],
        sampleScore: 8.7,
        synopsis: 'Tanjiro Kamado joins the Demon Slayer Corps to save his sister...',
        alternativeTitles: [{ type: 'Default', title: 'Kimetsu no Yaiba' }],
        format: 'TV',
        episodes: 26,
        status: 'Finished Airing',
        aired: '2019-04-06 to 2020-07-18',
        duration: '24 min. per ep.',
        rating: 'R'
      }
    ];
  }
};

export const schedule = [
  { slug: 'frieren', title: 'Frieren', day: 'Mon' },
  { slug: 'blue-lock', title: 'Blue Lock', day: 'Tue' },
  { slug: 'solo-leveling', title: 'Solo Leveling', day: 'Wed' },
  { slug: 'my-hero-academia', title: 'My Hero Academia', day: 'Thu' },
];
