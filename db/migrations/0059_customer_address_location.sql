-- Owner decision 2026-11-04: many villages can only be found by location. The first time a driver
-- delivers to an address and takes the delivery photo, the phone's GPS point is kept on that
-- customer address (WGS-84) so the next driver, even a new one, can navigate straight there.
-- The office can clear it if the customer moves; it is then learnt again on the next delivery.
ALTER TABLE customer_addresses
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS location_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_source TEXT,
  ADD COLUMN IF NOT EXISTS location_fulfillment_id TEXT;

ALTER TABLE customer_addresses
  ADD CONSTRAINT customer_addresses_location_check CHECK (
    (latitude IS NULL AND longitude IS NULL AND location_captured_at IS NULL)
    OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND location_captured_at IS NOT NULL)
  );
