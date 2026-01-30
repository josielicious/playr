const grid = document.getElementById("album-grid");
const page = document.getElementById("album-page");
const searchInput = document.getElementById("search");

if (searchInput) {
  searchInput.addEventListener("input", e => {
    render(e.target.value);
  });
}

function getRating(key) {
  return parseFloat(localStorage.getItem(key)) || 0;
}

function saveRating(key, value) {
  localStorage.setItem(key, value);
  render();
}

function isInterlude(key) {
  return localStorage.getItem("interlude_" + key) === "true";
}

function toggleInterlude(key) {
  const current = isInterlude(key);
  localStorage.setItem("interlude_" + key, !current);
  render();
}

function getAlbumScore(album) {
  let scores = [];

  album.discs.forEach((disc, discIndex) => {
    disc.tracks.forEach((_, trackIndex) => {
      const key = `track_${album.id}_${discIndex}_${trackIndex}`;

      if (isInterlude(key)) return;

      const rating = getRating(key);
      if (rating > 0) scores.push(rating);
    });
  });

  if (!scores.length) return 0;

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function generateStars(key, rating, readonly = false) {
  let html = `<div class="stars${readonly ? ' readonly' : ''}">`;

  for (let i = 1; i <= 5; i++) {
    const full = rating >= i;
    const half = rating >= i - 0.5 && rating < i;

    html += `
      <span class="star">
        <span class="half ${half ? "active" : ""}" onclick="saveRating('${key}', ${i - 0.5})">★</span>
        <span class="full ${full ? "active" : ""}" onclick="saveRating('${key}', ${i})">★</span>
      </span>
    `;
  }

  html += `</div>`;
  return html;
}

function getAlbumStats(album) {
  let total = 0;
  let count = 0;

  album.discs.forEach((disc, d) => {
    disc.tracks.forEach((_, t) => {
      const key = `track_${album.id}_${d}_${t}`;
      if (isInterlude(key)) return;

      const r = getRating(key);
      if (r > 0) {
        total += r;
        count++;
      }
    });
  });

  return {
    avg: count ? (total / count) : 0,
    count
  };
}

function render(searchQuery = "") {
  const query = searchQuery.trim().toLowerCase();

  if (grid) {
    grid.innerHTML = "";

    albums.forEach(album => {
      let matchLabel = "";

      const albumTitleMatch = album.title.toLowerCase().includes(query);
      const artistMatch = album.artist.toLowerCase().includes(query);

      if (albumTitleMatch) {
        matchLabel = "Matched album title";
      } else if (artistMatch) {
        matchLabel = "Matched artist";
      } else {
        for (let d = 0; d < album.discs.length; d++) {
          for (let t = 0; t < album.discs[d].tracks.length; t++) {
            const track = album.discs[d].tracks[t];
            const key = `track_${album.id}_${d}_${t}`;

            if (isInterlude(key)) continue;

            if (track.toLowerCase().includes(query)) {
              matchLabel = `Matched track: “${track}”`;
              break;
            }
          }
          if (matchLabel) break;
        }
      }

      if (query && !matchLabel) return;

      const rating = getAlbumScore(album);

      const div = document.createElement("div");
      div.className = "album-card";
      div.innerHTML = `
        <img src="${album.cover}">
        <h3>${album.title}</h3>
        <p>${album.artist}</p>

        ${query && matchLabel ? `<div class="match-label">${matchLabel}</div>` : ""}

        <div class="score">
          ${rating ? generateStars("album_display_" + album.id, rating, true) : "Not rated"}
        </div>

        <a class="open-btn" href="album.html?id=${album.id}">Open</a>
      `;

      grid.appendChild(div);
    });
  }

  if (page) {
    const id = new URLSearchParams(window.location.search).get("id");
    const album = albums.find(a => a.id == id);
    const rating = getAlbumScore(album);

    page.innerHTML = `
      <div class="album-view">
        <img src="${album.cover}">
        <h2>${album.title}</h2>
        <p>${album.artist} • ${album.year}</p>

        <h3>Album Rating</h3>
        <div class="stars readonly">
          ${generateStars("album_display_" + album.id, rating)}
        </div>

        <h3>Tracks</h3>
        <div class="tracklist">
          ${
            album.discs.length === 1
              ? album.discs[0].tracks.map((track, trackIndex) => {
                  const key = `track_${album.id}_0_${trackIndex}`;
                  const blocked = isInterlude(key);

                  return `
                    <div class="track ${blocked ? "is-interlude" : ""}">
                      <span class="track-title">${track}</span>
                      ${blocked ? "" : generateStars(key, getRating(key))}
                      <button class="interlude-toggle" onclick="toggleInterlude('${key}')">
                        <i class="fa-solid fa-ban"></i>
                      </button>
                    </div>
                  `;
                }).join("")
              : album.discs.map((disc, discIndex) => `
                  <div class="disc">
                    <h4>${disc.name}</h4>
                    <div class="tracklist">
                      ${disc.tracks.map((track, trackIndex) => {
                        const key = `track_${album.id}_${discIndex}_${trackIndex}`;
                        const blocked = isInterlude(key);

                        return `
                          <div class="track ${blocked ? "is-interlude" : ""}">
                            <span class="track-title">${track}</span>
                            ${blocked ? "" : generateStars(key, getRating(key))}
                            <button class="interlude-toggle" onclick="toggleInterlude('${key}')">
                              <i class="fa-solid fa-ban"></i>
                            </button>
                          </div>
                        `;
                      }).join("")}
                    </div>
                  </div>
                `).join("")
          }
        </div>
      </div>
    `;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => {
    document.body.classList.add("page-enter");
  });
});

document.addEventListener("click", e => {
  const link = e.target.closest("a");

  if (!link || link.target === "_blank") return;
  if (!link.href || link.origin !== location.origin) return;

  e.preventDefault();

  document.body.classList.add("page-exit");

  setTimeout(() => {
    window.location.href = link.href;
  }, 250);
});

render();