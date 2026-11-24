import { useState } from 'react';
import { api } from '../lib/api.js';
import { digits, maskCep } from '../lib/format.js';
import { useForm } from '../lib/hooks.js';
import { Alert, Button, Checkbox, Input, Select } from './ui.jsx';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

const EMPTY = { label: 'Casa', recipient: '', cep: '', street: '', number: '', complement: '', district: '', city: '', state: '', isDefault: false };

/** Formulário de endereço com preenchimento automático pelo CEP (ViaCEP). */
export default function AddressForm({ initial, defaultRecipient = '', onSaved, onCancel, submitLabel = 'Salvar endereço' }) {
  const f = useForm(initial ? { ...EMPTY, ...initial, cep: maskCep(initial.cep) } : { ...EMPTY, recipient: defaultRecipient });
  const [cepStatus, setCepStatus] = useState('');

  const lookup = async (value) => {
    const cep = digits(value);
    if (cep.length !== 8) return;
    setCepStatus('Buscando endereço…');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await res.json();
      if (d.erro) {
        setCepStatus('CEP não encontrado. Preencha o endereço manualmente.');
        return;
      }
      f.setValues((v) => ({ ...v, street: d.logradouro || v.street, district: d.bairro || v.district, city: d.localidade || v.city, state: d.uf || v.state }));
      setCepStatus('');
    } catch {
      setCepStatus('Não conseguimos buscar o CEP agora. Preencha manualmente.');
    }
  };

  const save = f.submit(async (values) => {
    const body = { ...values, cep: digits(values.cep) };
    const res = initial?.id ? await api.put(`/account/addresses/${initial.id}`, body) : await api.post('/account/addresses', body);
    onSaved?.(res.address);
  });

  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-6" noValidate>
      {f.formError && !Object.keys(f.errors).length && <Alert className="sm:col-span-6">{f.formError}</Alert>}
      <Input
        label="CEP"
        className="sm:col-span-2"
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="00000-000"
        {...f.bind('cep', maskCep)}
        onBlur={(e) => lookup(e.target.value)}
        onChange={(e) => {
          const v = maskCep(e.target.value);
          f.set('cep', v);
          if (digits(v).length === 8) lookup(v);
        }}
        hint={cepStatus}
      />
      <Input label="Rua / avenida" className="sm:col-span-4" autoComplete="address-line1" {...f.bind('street')} />
      <Input label="Número" className="sm:col-span-2" {...f.bind('number')} />
      <Input label="Complemento" optional className="sm:col-span-4" placeholder="Apto, bloco, referência" autoComplete="address-line2" {...f.bind('complement')} />
      <Input label="Bairro" className="sm:col-span-2" {...f.bind('district')} />
      <Input label="Cidade" className="sm:col-span-3" autoComplete="address-level2" {...f.bind('city')} />
      <Select label="UF" className="sm:col-span-1" {...f.bind('state')}>
        <option value="">—</option>
        {UFS.map((u) => (
          <option key={u}>{u}</option>
        ))}
      </Select>
      <Input label="Quem vai receber" className="sm:col-span-4" autoComplete="name" {...f.bind('recipient')} />
      <Input label="Nome do endereço" className="sm:col-span-2" placeholder="Casa, trabalho…" {...f.bind('label')} />
      <Checkbox className="sm:col-span-6" label="Usar como endereço principal" checked={f.values.isDefault} onChange={(e) => f.set('isDefault', e.target.checked)} />
      <div className="flex gap-3 sm:col-span-6">
        <Button type="submit" loading={f.submitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
