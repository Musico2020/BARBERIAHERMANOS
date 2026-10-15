/*
  Mensajes del chat de la web (botón flotante de WhatsApp).
  El visitante escribe desde la página sin abrir WhatsApp; el mensaje queda aquí y el
  administrador lo ve en Panel -> Mensajes, desde donde responde por WhatsApp.

  - El público solo puede enviar mensajes con send_contact_message(); no puede leer ninguno.
  - Límite anti-spam: 5 mensajes por celular por hora y 30 en total por minuto.
*/

CREATE TABLE IF NOT EXISTS contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_messages_created_idx ON contact_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_phone_idx ON contact_messages (phone, created_at DESC);

ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_messages_admin ON contact_messages
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION public.send_contact_message(p_name text, p_phone text, p_message text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name    text := trim(coalesce(p_name, ''));
  v_phone   text := normalize_phone(p_phone);
  v_message text := trim(coalesce(p_message, ''));
  v_id      uuid;
BEGIN
  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;
  IF length(v_phone) < 10 OR length(v_phone) > 13 THEN
    RAISE EXCEPTION 'INVALID_PHONE';
  END IF;
  IF length(v_message) < 1 OR length(v_message) > 1000 THEN
    RAISE EXCEPTION 'INVALID_MESSAGE';
  END IF;

  IF (SELECT count(*) FROM contact_messages
      WHERE phone = v_phone AND created_at > now() - interval '1 hour') >= 5
     OR (SELECT count(*) FROM contact_messages
      WHERE created_at > now() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'TOO_MANY_MESSAGES';
  END IF;

  INSERT INTO contact_messages (name, phone, message)
  VALUES (v_name, v_phone, v_message)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.send_contact_message(text, text, text) TO anon, authenticated;
