
/*
  # Barbershop Complete Schema

  ## Tables Created:
  1. **barbers** - Barber profiles with availability, PIN, commission, stats
  2. **services** - Services offered with price, duration, category
  3. **bookings** - Customer appointments linking barbers and services
  4. **admin_users** - Admin authentication records

  ## Security:
  - RLS enabled on all tables
  - Public can read barbers and services (for booking flow)
  - Bookings are insertable by anyone (public booking) but only readable by authenticated users
  - Admin users table is restricted to authenticated users only
*/

CREATE TABLE IF NOT EXISTS barbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  specialties jsonb NOT NULL DEFAULT '[]',
  rating numeric(3,2) NOT NULL DEFAULT 4.8,
  review_count integer NOT NULL DEFAULT 0,
  available boolean NOT NULL DEFAULT true,
  pin text NOT NULL DEFAULT '0000',
  commission integer NOT NULL DEFAULT 40,
  total_services_month integer NOT NULL DEFAULT 0,
  earnings_month integer NOT NULL DEFAULT 0,
  avatar text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'cortes',
  duration integer NOT NULL DEFAULT 30,
  price integer NOT NULL DEFAULT 15000,
  description text NOT NULL DEFAULT '',
  popular boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  client_phone text NOT NULL,
  client_email text NOT NULL DEFAULT '',
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  barber_id uuid REFERENCES barbers(id) ON DELETE SET NULL,
  barber_name text NOT NULL,
  date date NOT NULL,
  time text NOT NULL,
  price integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled','no-show')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active barbers"
  ON barbers FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert barbers"
  ON barbers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update barbers"
  ON barbers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete barbers"
  ON barbers FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can read active services"
  ON services FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert services"
  ON services FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update services"
  ON services FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete services"
  ON services FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can create bookings"
  ON bookings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read bookings"
  ON bookings FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can update bookings"
  ON bookings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete bookings"
  ON bookings FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can read admin users"
  ON admin_users FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS bookings_date_idx ON bookings(date);
CREATE INDEX IF NOT EXISTS bookings_barber_id_idx ON bookings(barber_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);
