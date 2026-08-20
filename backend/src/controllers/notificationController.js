const { NotificationSeen, NotificationRead } = require("../models");
const ApiError = require("../utils/ApiError");

const KNOWN_FEEDS = ["deliberations", "discipline_reports", "discipline_queue"];

/**
 * Returns when this user last opened the given feed, or null if they
 * never have — the frontend treats "never seen" as "everything currently
 * in the feed is unread" rather than defaulting to some fabricated
 * timestamp.
 */
async function getSeen(req, res, next) {
  try {
    const { feed } = req.query;
    if (!KNOWN_FEEDS.includes(feed)) return res.json({ lastSeenAt: null });

    const row = await NotificationSeen.findOne({
      where: { userId: req.user.id, feed },
    });
    res.json({ lastSeenAt: row?.lastSeenAt || null });
  } catch (err) {
    next(err);
  }
}

/**
 * Marks a feed as seen right now — called when the person opens that
 * bell's dropdown. Upsert on userId+feed so repeated opens just bump the
 * same row forward instead of accumulating history (there's nothing
 * useful to keep from a past "seen" moment once a newer one replaces it).
 */
async function markSeen(req, res, next) {
  try {
    const { feed } = req.body;
    if (!KNOWN_FEEDS.includes(feed)) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Unknown feed" } });
    }

    const [row] = await NotificationSeen.findOrCreate({
      where: { userId: req.user.id, feed },
      defaults: { schoolId: req.schoolId, userId: req.user.id, feed, lastSeenAt: new Date() },
    });
    await row.update({ lastSeenAt: new Date() });

    res.json({ lastSeenAt: row.lastSeenAt });
  } catch (err) {
    next(err);
  }
}

/**
 * Returns every itemId in this feed the current user has explicitly
 * marked read, so the frontend can compute per-notification read/unread
 * state (anything not in this list is unread) without a row-per-item
 * round trip.
 */
async function listRead(req, res, next) {
  try {
    const { feed } = req.query;
    if (!KNOWN_FEEDS.includes(feed)) return res.json({ itemIds: [] });

    const rows = await NotificationRead.findAll({
      where: { userId: req.user.id, feed },
      attributes: ["itemId"],
    });
    res.json({ itemIds: rows.map((r) => r.itemId) });
  } catch (err) {
    next(err);
  }
}

/**
 * Marks one notification item read. Upsert on userId+feed+itemId so
 * re-marking something already read is a no-op rather than an error.
 */
async function markItemRead(req, res, next) {
  try {
    const { feed, itemId } = req.body;
    if (!KNOWN_FEEDS.includes(feed)) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Unknown feed" } });
    }
    if (!itemId) return next(ApiError.badRequest("itemId is required"));

    const [row] = await NotificationRead.findOrCreate({
      where: { userId: req.user.id, feed, itemId },
      defaults: { schoolId: req.schoolId, userId: req.user.id, feed, itemId, readAt: new Date() },
    });
    res.json({ itemId: row.itemId, readAt: row.readAt });
  } catch (err) {
    next(err);
  }
}

/**
 * Marks one notification item unread again by deleting its read row —
 * read/unread is represented by the row's presence, not a status flag.
 */
async function markItemUnread(req, res, next) {
  try {
    const { feed, itemId } = req.body;
    if (!KNOWN_FEEDS.includes(feed)) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Unknown feed" } });
    }
    if (!itemId) return next(ApiError.badRequest("itemId is required"));

    await NotificationRead.destroy({ where: { userId: req.user.id, feed, itemId } });
    res.json({ itemId: Number(itemId) });
  } catch (err) {
    next(err);
  }
}

/**
 * Marks every currently-listed item in a feed read in one call, for a
 * "mark all as read" action — bulkCreate with ignoreDuplicates so items
 * already read are left alone instead of erroring on the unique index.
 */
async function markAllRead(req, res, next) {
  try {
    const { feed, itemIds } = req.body;
    if (!KNOWN_FEEDS.includes(feed)) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Unknown feed" } });
    }
    if (!Array.isArray(itemIds) || itemIds.length === 0) return res.json({ itemIds: [] });

    await NotificationRead.bulkCreate(
      itemIds.map((itemId) => ({ schoolId: req.schoolId, userId: req.user.id, feed, itemId, readAt: new Date() })),
      { ignoreDuplicates: true }
    );
    res.json({ itemIds });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSeen, markSeen, listRead, markItemRead, markItemUnread, markAllRead };
