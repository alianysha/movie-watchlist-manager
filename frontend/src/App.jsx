import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const API = "https://cinebox-api-ae9y.onrender.com/api/movies";

const GENRES = [
  "Action", "Comedy", "Drama", "Horror",
  "Sci-Fi", "Romance", "Thriller",
];

const PLATFORMS = [
  "Netflix", "Prime Video", "Hotstar", "Theatre", "Other",
];

const EMPTY_FORM = {
  title: "",
  genre: "Drama",
  releaseYear: new Date().getFullYear(),
  runtime: 120,
  platform: "Netflix",
  priority: 3,
};

export default function App() {
  const [movies, setMovies] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [nextMovie, setNextMovie] = useState(null);

  const notifyError = (err) => {
    setError(err.response?.data?.message || err.message || "Something went wrong.");
    setMessage("");
  };

  const loadMovies = useCallback(async () => {
    try {
      const response = await axios.get(API, {
        params: {
          page,
          status: statusFilter || undefined,
          genre: genreFilter || undefined,
          search: search.trim() || undefined,
        },
      });

      setMovies(response.data.data.movies);
      setTotalPages(Math.max(1, response.data.data.totalPages));
    } catch (err) {
      notifyError(err);
    }
  }, [page, statusFilter, genreFilter, search]);

  const loadStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/stats`);
      setStats(response.data.data);
    } catch (err) {
      notifyError(err);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadMovies(), loadStats()]);
  }, [loadMovies, loadStats]);

  useEffect(() => {
    loadMovies();
  }, [loadMovies]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const changeField = (event) => {
    const { name, value } = event.target;
    setForm((old) => ({ ...old, [name]: value }));
  };

  const saveMovie = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const year = Number(form.releaseYear);
    const runtime = Number(form.runtime);
    const priority = Number(form.priority);

    if (!form.title.trim()) {
      setError("Enter a movie title.");
      return;
    }
    if (year < 1950 || year > new Date().getFullYear()) {
      setError("Release year must be between 1950 and the current year.");
      return;
    }
    if (runtime < 30 || runtime > 300) {
      setError("Runtime must be between 30 and 300 minutes.");
      return;
    }
    if (priority < 1 || priority > 5) {
      setError("Priority must be between 1 and 5.");
      return;
    }

    setBusy(true);

    try {
      if (editingId) {
        await axios.put(`${API}/${editingId}`, {
          title: form.title.trim(),
          genre: form.genre,
          runtime,
          platform: form.platform,
          priority,
        });
        setMessage("Movie updated successfully.");
      } else {
        await axios.post(API, {
          title: form.title.trim(),
          genre: form.genre,
          releaseYear: year,
          runtime,
          platform: form.platform,
          priority,
        });
        setMessage("Movie added successfully.");
      }

      setForm({ ...EMPTY_FORM });
      setEditingId(null);
      setPage(1);
      await refresh();
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const editMovie = (movie) => {
    setEditingId(movie._id);
    setForm({
      title: movie.title,
      genre: movie.genre,
      releaseYear: movie.releaseYear,
      runtime: movie.runtime,
      platform: movie.platform,
      priority: movie.priority,
    });
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setError("");
    setMessage("");
  };

  const changeStatus = async (movie, newStatus) => {
    if (!newStatus) return;

    let rating;

    if (newStatus === "Watched") {
      const entered = window.prompt("Enter a rating from 1 to 10:");
      if (entered === null) return;

      rating = Number(entered);

      if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
        setError("Rating must be a whole number from 1 to 10.");
        return;
      }
    }

    setError("");
    setMessage("");

    try {
      await axios.patch(`${API}/${movie._id}/status`, {
        status: newStatus,
        ...(newStatus === "Watched" ? { rating } : {}),
      });

      setMessage("Status updated successfully.");
      await refresh();
    } catch (err) {
      notifyError(err);
    }
  };

  const editRating = async (movie) => {
    const entered = window.prompt(
      "Enter a new rating from 1 to 10:",
      String(movie.rating ?? "")
    );

    if (entered === null) return;

    const rating = Number(entered);

    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      setError("Rating must be a whole number from 1 to 10.");
      return;
    }

    try {
      await axios.patch(`${API}/${movie._id}/rating`, { rating });
      setMessage("Rating updated successfully.");
      setError("");
      await refresh();
    } catch (err) {
      notifyError(err);
    }
  };

  const deleteMovie = async (movie) => {
    if (movie.status === "Watching") {
      setError("A movie currently being watched cannot be deleted.");
      return;
    }

    if (!window.confirm(`Delete "${movie.title}"?`)) return;

    try {
      await axios.delete(`${API}/${movie._id}`);
      setMessage("Movie deleted successfully.");
      setError("");

      if (movies.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        await refresh();
      }
      await loadStats();
    } catch (err) {
      notifyError(err);
    }
  };

  const watchNext = async () => {
    try {
      setError("");
      setMessage("");
      const response = await axios.get(`${API}/watch-next`);
      setNextMovie(response.data.data);
    } catch (err) {
      setNextMovie(null);
      notifyError(err);
    }
  };

  const formatDate = (date) =>
    date ? new Date(date).toLocaleDateString() : "—";

  return (
    <main>
      <header>
        <h1>CINEBOX</h1>
        <p>Your collection, your story.</p>
      </header>

      <section>
        <h2>Your movie watchlist</h2>
        <button onClick={watchNext}>What should I watch next?</button>

        {nextMovie && (
          <p>
            Watch next: <strong>{nextMovie.title}</strong> — Priority{" "}
            {nextMovie.priority}, {nextMovie.runtime} minutes.
          </p>
        )}
      </section>

      {error && <p role="alert" style={{ color: "red" }}>{error}</p>}
      {message && <p role="status" style={{ color: "green" }}>{message}</p>}

      <section>
        <h2>Statistics</h2>
        {stats ? (
          <div>
            <p>Total movies: {stats.totalMovies}</p>
            <p>To Watch: {stats.counts["To Watch"]}</p>
            <p>Watching: {stats.counts.Watching}</p>
            <p>Watched: {stats.counts.Watched}</p>
            <p>Hours watched: {stats.hoursWatched}</p>
            <p>Average rating: {stats.averageRating}/10</p>
            <p>Top watched genre: {stats.topGenre}</p>
          </div>
        ) : (
          <p>Loading statistics...</p>
        )}
      </section>

      <section>
        <h2>{editingId ? "Edit movie" : "Add a movie"}</h2>

        <form onSubmit={saveMovie}>
          <label>
            Movie title
            <input
              name="title"
              value={form.title}
              onChange={changeField}
              required
            />
          </label>

          <label>
            Genre
            <select name="genre" value={form.genre} onChange={changeField}>
              {GENRES.map((genre) => (
                <option key={genre} value={genre}>{genre}</option>
              ))}
            </select>
          </label>

          <label>
            Release year
            <input
              type="number"
              name="releaseYear"
              min="1950"
              max={new Date().getFullYear()}
              value={form.releaseYear}
              onChange={changeField}
              disabled={Boolean(editingId)}
              required
            />
          </label>

          <label>
            Runtime (minutes)
            <input
              type="number"
              name="runtime"
              min="30"
              max="300"
              value={form.runtime}
              onChange={changeField}
              required
            />
          </label>

          <label>
            Platform
            <select name="platform" value={form.platform} onChange={changeField}>
              {PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>{platform}</option>
              ))}
            </select>
          </label>

          <label>
            Priority: {form.priority}/5
            <input
              type="range"
              name="priority"
              min="1"
              max="5"
              value={form.priority}
              onChange={changeField}
            />
          </label>

          <button type="submit" disabled={busy}>
            {busy ? "Saving..." : editingId ? "Save changes" : "Add to watchlist"}
          </button>

          {editingId && (
            <button type="button" onClick={cancelEdit}>Cancel edit</button>
          )}
        </form>
      </section>

      <section>
        <h2>Your collection</h2>

        <label>
          Search by title
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search movies..."
          />
        </label>

        <label>
          Filter by genre
          <select
            value={genreFilter}
            onChange={(e) => {
              setGenreFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All genres</option>
            {GENRES.map((genre) => (
              <option key={genre} value={genre}>{genre}</option>
            ))}
          </select>
        </label>

        <label>
          Filter by status
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="To Watch">To Watch</option>
            <option value="Watching">Watching</option>
            <option value="Watched">Watched</option>
          </select>
        </label>

        {movies.length === 0 ? (
          <p>No movies found.</p>
        ) : (
          movies.map((movie) => {
            const validNextStatuses =
              movie.status === "To Watch"
                ? ["Watching", "Watched"]
                : movie.status === "Watching"
                  ? ["Watched", "To Watch"]
                  : [];

            return (
              <article key={movie._id} className="movie-card">
                <h3>{movie.title}</h3>
                <p>Code: {movie.movieCode}</p>
                <p>Genre: {movie.genre}</p>
                <p>Release year: {movie.releaseYear}</p>
                <p>Runtime: {movie.runtime} minutes</p>
                <p>Platform: {movie.platform}</p>
                <p>Priority: {movie.priority}/5</p>
                <p>Status: <strong>{movie.status}</strong></p>
                <p>Rating: {movie.rating ?? "Not rated"}</p>
                <p>Watched date: {formatDate(movie.watchedDate)}</p>

                {validNextStatuses.length > 0 && (
                  <label>
                    Change status
                    <select
                      value=""
                      onChange={(e) => changeStatus(movie, e.target.value)}
                    >
                      <option value="">Choose next status</option>
                      {validNextStatuses.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                )}

                {movie.status === "Watched" && (
                  <button onClick={() => editRating(movie)}>Edit rating</button>
                )}

                <button onClick={() => editMovie(movie)}>Edit movie</button>

                <button
                  onClick={() => deleteMovie(movie)}
                  disabled={movie.status === "Watching"}
                >
                  Delete
                </button>
              </article>
            );
          })
        )}

        <div>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>

          <span> Page {page} of {totalPages} </span>

          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}