import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Bookmark, Link2, Trash2, Check, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Atlas } from "./anatomy";
import { usePanelViewport } from "./use-panel-viewport";
import {
  MAX_SAVED_VIEWS,
  savedViewsKey,
  readBookmarks,
  writeBookmarks,
  shareViewUrl,
  type Bookmark as SavedBookmark,
  type SavedView,
} from "./saved-views";

interface Props {
  atlas: Atlas;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareOpen: boolean;
  onShareOpenChange: (open: boolean) => void;
  panelAnchor: RefObject<HTMLDivElement | null>;
  ready: boolean;
  defaultName: string;
  getView: () => SavedView | null;
  onRestore: (view: SavedView) => void;
}

export default function ViewLibrary({ atlas, open, onOpenChange, shareOpen, onShareOpenChange, panelAnchor, ready, defaultName, getView, onRestore }: Props) {
  const [bookmarks, setBookmarks] = useState<SavedBookmark[]>(() => {
    try {
      return readBookmarks(localStorage, atlas);
    } catch {
      return [];
    }
  });
  const panelContent = useRef<HTMLDivElement>(null);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const shareContent = useRef<HTMLDivElement>(null);
  const shareTitle = useRef<HTMLHeadingElement>(null);
  usePanelViewport(panelAnchor, open || shareOpen, shareOpen ? shareContent : panelContent);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === savedViewsKey(atlas.sex) || event.key === null) {
        try {
          setBookmarks(readBookmarks(localStorage, atlas));
        } catch {
          /* Storage may be blocked. */
        }
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [atlas]);
  const update = (next: SavedBookmark[]) => {
    try {
      if (!writeBookmarks(localStorage, next, atlas.sex)) return false;
      setBookmarks(next);
      return true;
    } catch {
      return false;
    }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    const view = getView();
    if (!view || !name.trim()) return;
    const next = [{ id: crypto.randomUUID(), name: name.trim().slice(0, 80), view }, ...bookmarks];
    setMessage(
      update(next)
        ? "View saved on this device."
        : "Your browser could not save this view. You can still share a link.",
    );
  };
  const prepareLink = () => {
    const view = getView();
    setCopied(false);
    setLink(view ? shareViewUrl(location.href, view) : "");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
      document.querySelector<HTMLInputElement>("#shared-view-link")?.select();
    }
  };
  return (
    <div className="view-library-actions">
      <Popover
        open={open}
        onOpenChange={(value) => {
          onOpenChange(value);
          if (value) {
            setName(defaultName);
            setMessage("");
          }
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              className="icon-button"
              aria-label="Saved views"
              title="Saved views"
            />
          }
        >
          <Bookmark size={18} />
        </PopoverTrigger>
        <PopoverContent
          ref={panelContent}
          anchor={panelAnchor}
          positionMethod="fixed"
          align="end"
          sideOffset={0}
          collisionAvoidance={{ side: "none", align: "none", fallbackAxisSide: "none" }}
          collisionPadding={{ top: 0, left: 0, right: 0, bottom: 16 }}
          initialFocus={panelTitle}
          className="saved-views-panel glass"
          aria-label="Saved views"
        >
          <div className="panel-heading">
            <h2 ref={panelTitle} tabIndex={-1}>Saved views</h2>
            <Button variant="ghost" className="icon-button panel-close" onClick={() => onOpenChange(false)} aria-label="Close saved views">
              <X size={18} />
            </Button>
          </div>
          <p className="view-panel-note">Keep your camera, selection, and layers on this device.</p>
          <form onSubmit={save} className="save-view-form">
            <label htmlFor="saved-view-name">View name</label>
            <input
              id="saved-view-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name this view"
              autoComplete="off"
            />
            <Button
              type="submit"
              disabled={!ready || !name.trim() || bookmarks.length >= MAX_SAVED_VIEWS}
            >
              Save current view
            </Button>
          </form>
          {!ready && <p className="view-panel-note">Available when the view finishes moving.</p>}
          {bookmarks.length >= MAX_SAVED_VIEWS && (
            <p className="view-panel-note">
              Your 20 saved views are full. Delete one to make room.
            </p>
          )}
          <div className="saved-view-list">
            {bookmarks.map((bookmark) => (
              <div className="saved-view-row" key={bookmark.id}>
                <Button
                  variant="ghost"
                  className="restore-view"
                  disabled={!ready}
                  onClick={() => {
                    onRestore(bookmark.view);
                    onOpenChange(false);
                  }}
                >
                  {bookmark.name}
                </Button>
                <Button
                  variant="ghost"
                  className="delete-view"
                  aria-label={`Delete saved view ${bookmark.name}`}
                  onClick={() =>
                    setMessage(
                      update(bookmarks.filter((item) => item.id !== bookmark.id))
                        ? "Saved view deleted."
                        : "Your browser could not delete this view.",
                    )
                  }
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
            {!bookmarks.length && <p className="view-panel-note">No saved views yet.</p>}
          </div>
          <p className="view-status" role="status">
            {message}
          </p>
        </PopoverContent>
      </Popover>
      <Popover
        open={shareOpen}
        onOpenChange={(value) => {
          onShareOpenChange(value);
          if (value) prepareLink();
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              className="icon-button"
              disabled={!ready}
              aria-label="Share current view"
              title="Share current view"
            />
          }
        >
          <Link2 size={18} />
        </PopoverTrigger>
        <PopoverContent
          ref={shareContent}
          anchor={panelAnchor}
          positionMethod="fixed"
          align="end"
          sideOffset={0}
          collisionAvoidance={{ side: "none", align: "none", fallbackAxisSide: "none" }}
          collisionPadding={{ top: 0, left: 0, right: 0, bottom: 16 }}
          initialFocus={shareTitle}
          className="share-view-panel glass"
          aria-label="Share current view"
        >
          <h2 ref={shareTitle} tabIndex={-1}>Share this view</h2>
          <p className="view-panel-note">This link opens the same camera, selection, and layers.</p>
          <label htmlFor="shared-view-link">View link</label>
          <input
            id="shared-view-link"
            readOnly
            value={link}
            onFocus={(event) => event.target.select()}
          />
          <Button onClick={copy} disabled={!link}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <p className="view-panel-note" role="status">
            {copied ? "Link copied to clipboard." : "You can also select and copy the link above."}
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
