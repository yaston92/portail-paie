-- Contrat d'apprentissage, en plus de CDI et CDD.
alter type public.contrat_type add value if not exists 'apprentissage';
