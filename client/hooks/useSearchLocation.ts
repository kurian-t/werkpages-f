import { useEffect, useRef, useState } from "react";
import { fetchGeo } from "@/lib/geo";
import { countryFromGeo, EMPTY_LOCATION, LocationValue } from "@/lib/location";

/**
 * The location question on a manager SEARCH, shared by every surface that runs one.
 *
 * <p>/find, the directory and a company profile all run the same search through
 * {@code useManagerSearchFlow}, so they ask this question the same way through this hook. Written
 * once rather than three times: three copies is how the add form got role suggestions while the
 * review form kept a bare text box, and the same drift would happen here.
 *
 * <h2>What is pre-filled, and what is not</h2>
 *
 * <p>Only the COUNTRY, from the visitor's address, as a default they can change. Never the city or
 * the region: those describe the reader, and a search that asks for no location used to publish
 * the searcher's own city onto the manager it created. If geolocation says nothing, the field is
 * left empty rather than guessed.
 *
 * <h2>Why the default is applied once</h2>
 *
 * <p>Seeding on every render would overwrite a country the person had just chosen, which is the
 * classic form bug: the field appears to reject the change and snaps back. The seed runs once, and
 * never after anybody has touched the field.
 */
export function useSearchLocation() {
  const [location, setLocationRaw] = useState<LocationValue>(EMPTY_LOCATION);
  const [editing, setEditing] = useState(false);
  /** Set the moment a person changes the field, so geolocation can never overwrite them again. */
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const geo = await fetchGeo();
      // A person who already answered outranks their address, including when the lookup is slow
      // enough to land after they have typed.
      if (cancelled || touched.current) return;
      const seeded = countryFromGeo(geo);
      if (seeded.country) setLocationRaw(seeded);
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * A change the PERSON made.
   *
   * <p>LocationField replaces the whole value on every selection, so choosing a different country
   * already discards a city or building that belonged to the old one - there is nothing to clear
   * by hand, and nothing can be left behind that contradicts the new choice.
   */
  const setLocation = (next: LocationValue) => {
    touched.current = true;
    setLocationRaw(next);
  };

  return {
    location,
    setLocation,
    editing,
    startEditing: () => setEditing(true),
    stopEditing: () => setEditing(false),
    /** True once a person has answered, as opposed to the country merely being defaulted. */
    confirmedByPerson: touched.current,
  };
}
