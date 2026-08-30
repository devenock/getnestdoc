import { AsyncResource } from 'async_hooks';
import { Observable, defer, from } from 'rxjs';
import { mergeAll } from 'rxjs/operators';
import { ExecutionContextHost } from '../helpers/execution-context-host.js';
import { isEmptyArray } from '@nestjs/common/internal';
export class InterceptorsConsumer {
    async intercept(interceptors, args, instance, callback, next, type) {
        if (!interceptors || isEmptyArray(interceptors)) {
            return next();
        }
        const context = this.createContext(args, instance, callback);
        context.setType(type);
        const nextFn = async (i = 0) => {
            if (i >= interceptors.length) {
                return defer(AsyncResource.bind(() => this.transformDeferred(next)));
            }
            const handler = {
                handle: () => defer(AsyncResource.bind(() => nextFn(i + 1))).pipe(mergeAll()),
            };
            return interceptors[i].intercept(context, handler);
        };
        return defer(() => nextFn()).pipe(mergeAll());
    }
    createContext(args, instance, callback) {
        return new ExecutionContextHost(args, instance.constructor, callback);
    }
    transformDeferred(next) {
        // Call next() eagerly here — this method is invoked inside
        // defer(AsyncResource.bind(...)), so the async context (e.g. AsyncLocalStorage)
        // is correctly inherited. Deferring next() into the subscriber function would
        // lose that context because the subscriber is called outside the bound scope.
        const nextPromise = next();
        return new Observable(subscriber => {
            let innerSub;
            nextPromise
                .then(res => {
                if (subscriber.closed) {
                    // The outer subscription was torn down (e.g. an SSE client disconnect)
                    // before the async handler resolved. Do not subscribe the producer
                    // Observable after the consumer has already gone away — subscribing
                    // only to unsubscribe in the same tick would start producer side
                    // effects just to immediately abort them.
                    return;
                }
                const isDeferred = res instanceof Promise || res instanceof Observable;
                innerSub = from(isDeferred ? res : Promise.resolve(res)).subscribe(subscriber);
            })
                .catch(err => {
                if (!subscriber.closed) {
                    subscriber.error(err);
                }
            });
            return () => {
                innerSub?.unsubscribe();
            };
        });
    }
}
