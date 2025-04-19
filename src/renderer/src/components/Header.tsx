import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@renderer/components/ui/Accordion'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@renderer/components/ui/dialog'
import { ScrollArea } from '@renderer/components/ui/ScrollArea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger
} from '@renderer/components/ui/select'
import { HelpCircleIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'

export default function Header(): JSX.Element {
  const { t, i18n } = useTranslation()

  return (
    <div
      className={
        'fixed z-50 top-0 right-0 flex gap-2 justify-between w-screen p-4 bg-gray-200 dark:bg-gray-900 items-center'
      }
    >
      <div className={''}>
        <h1 className={'text-xl font-bold tracking-wider text-gray-950 dark:text-white'}>
          Paradox translation toolkit
        </h1>
        <p className={'text-gray-700 dark:text-gray-200/70 font-light text-sm'}>{t('subtitle')}</p>
      </div>
      <div className={'flex gap-2'}>
        <div className="flex gap-2">
          <NavLink to={'/'}>
            <Button variant="outline">{t('Converter')}</Button>
          </NavLink>
          <NavLink to={'/explorer'}>
            <Button variant="outline">{t('Explorer')}</Button>
          </NavLink>
        </div>
        <Dialog>
          <DialogTrigger>
            <Button variant="outline">
              <HelpCircleIcon />
            </Button>
          </DialogTrigger>
          <DialogContent className={'max-w-xl'}>
            <ScrollArea className={'max-h-64 px-2'}>
              <Accordion type={'multiple'}>
                <AccordionItem value={'howItWork'}>
                  <AccordionTrigger>{t('HowItWorks')}</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      <p>{t('HowItWorksDesc.1')}</p>
                      <p>{t('HowItWorksDesc.2')}</p>
                      <p>{t('HowItWorksDesc.3')}</p>
                      <p>{t('HowItWorksDesc.4')}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value={'howToUse'}>
                  <AccordionTrigger>{t('HowToUse')}</AccordionTrigger>
                  <AccordionContent>
                    <ol className="pl-6 space-y-2 list-decimal">
                      <li>{t('HowToUseDesc.1')}</li>
                      <li>{t('HowToUseDesc.2')}</li>
                      <li>{t('HowToUseDesc.3')}</li>
                      <li>{t('HowToUseDesc.4')}</li>
                      <li>{t('HowToUseDesc.5')}</li>
                      <li>{t('HowToUseDesc.6')}</li>
                      <li>{t('HowToUseDesc.7')}</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value={'limits'}>
                  <AccordionTrigger>{t('Limitations')}</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      <p>{t('HowItWorksDesc.1')}</p>
                      <p>{t('HowItWorksDesc.2')}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <Select
          onValueChange={(value) => {
            i18n.changeLanguage(value)
          }}
        >
          <SelectTrigger className="w-[180px]">{t(`languages.${i18n.language}`)}</SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="en">{t('languages.en')}</SelectItem>
              <SelectItem value="fr">{t('languages.fr')}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
