const list = document.getElementById("top-tracks-list");

let allTracks = [];

albums.forEach(album => {
  album.discs.forEach((disc, discIndex) => {
    disc.tracks.forEach((track, trackIndex) => {
      const key = `track_${album.id}_${discIndex}_${trackIndex}`;

      if (typeof isInterlude === "function" && isInterlude(key)) return;

      const rating = typeof getRating === "function" ? getRating(key) : null;
      if (!rating) return;
      
      allTracks.push({
        name: track,
        album: album.title,
        artist: album.artist,
        score: rating
      });
    });
  });
});

allTracks.sort((a, b) => b.score - a.score);

if (allTracks.length === 0) {
  list.innerHTML = `<p style="opacity:.6">No rated tracks yet.</p>`;
} else {
  list.innerHTML = allTracks.slice(0, 100).map((track, i) => `
    <div class="chart-item">
      <div class="chart-left">
        <div class="rank">#${i + 1}</div>
        <div>
          <div class="track-name">${track.name}</div>
          <div class="track-meta">${track.artist} — ${track.album}</div>
        </div>
      </div>

      ${generateStars(`top_album_${i}`, track.score, true)}
    </div>
  `).join("");
}