import { useEffect, useRef, useState } from "react";
import { getRestaurantDetails } from "../lib/api";
import { isFetchablePlaceId, needsDetailsRequest } from "../lib/restaurantDetails";

export function useRestaurantDetails(selected, selectedId) {
  const [records, setRecords] = useState({});
  const [attempt, setAttempt] = useState(0);
  const recordsRef = useRef({});

  useEffect(() => {
    if (!selectedId || !selected) return undefined;
    const existing = recordsRef.current[selected.id];

    if (!isFetchablePlaceId(selected.id)) {
      if (existing?.status !== "unavailable") {
        const next = {
          ...recordsRef.current,
          [selected.id]: {
            status: "unavailable",
            data: null,
            error: "Additional place details are unavailable for this restaurant."
          }
        };
        recordsRef.current = next;
        setRecords(next);
      }
      return undefined;
    }

    if (!needsDetailsRequest(selected, existing)) return undefined;

    const controller = new AbortController();
    let active = true;
    const loadingState = {
      ...recordsRef.current,
      [selected.id]: { status: "loading", data: existing?.data ?? null, error: "" }
    };
    recordsRef.current = loadingState;
    setRecords(loadingState);

    getRestaurantDetails(selected.id, controller.signal)
      .then((data) => {
        if (!active) return;
        const next = { ...recordsRef.current, [selected.id]: { status: "ready", data, error: "" } };
        recordsRef.current = next;
        setRecords(next);
      })
      .catch((error) => {
        if (!active || error.name === "AbortError") return;
        const unavailable = error.status === 400 || error.status === 404;
        const next = {
          ...recordsRef.current,
          [selected.id]: {
            status: unavailable ? "unavailable" : "error",
            data: null,
            error: error.message || "Couldn't load restaurant details."
          }
        };
        recordsRef.current = next;
        setRecords(next);
      });

    return () => {
      active = false;
      controller.abort();
      if (recordsRef.current[selected.id]?.status === "loading") {
        const next = { ...recordsRef.current };
        delete next[selected.id];
        recordsRef.current = next;
        setRecords(next);
      }
    };
  }, [selectedId, attempt, selected]);

  const retry = () => {
    if (!selectedId) return;
    const next = { ...recordsRef.current };
    delete next[selectedId];
    recordsRef.current = next;
    setRecords(next);
    setAttempt((value) => value + 1);
  };

  return { records, retry };
}
